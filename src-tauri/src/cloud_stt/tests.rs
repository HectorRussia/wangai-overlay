use super::*;
    use super::transcription::TranscriptionSegment;

    #[test]
    fn reset_invalidates_only_the_selected_stream_and_discards_its_audio() {
        let manager = AiSttManager::new(100, 500, 12_000);
        manager.ingest_audio(StreamKind::Incoming, &[0.2; 512]);
        let incoming = manager.generation(StreamKind::Incoming);
        let microphone = manager.generation(StreamKind::Microphone);
        manager.reset_stream(StreamKind::Incoming);
        assert_ne!(manager.generation(StreamKind::Incoming), incoming);
        assert_eq!(manager.generation(StreamKind::Microphone), microphone);
        let state = manager.inner.lock().unwrap();
        assert!(state.incoming.ring.is_empty());
        assert_eq!(state.incoming.next_sample_cursor, 0);
    }

    #[test]
    fn legacy_incomplete_confidence_decodes_but_never_becomes_accepted_speech() {
        let response: TranscriptionResponse = serde_json::from_str(
            r#"{"text":"go","segments":[{"start":0,"end":1}]}"#,
        ).unwrap();
        assert!(response.is_low_confidence());
        let response: TranscriptionResponse = serde_json::from_str(r#"{"text":"go"}"#).unwrap();
        assert!(response.is_low_confidence());
    }

    #[test]
    fn converts_float_samples_to_pcm16() {
        assert_eq!(f32_to_pcm16(-1.0), i16::MIN);
        assert_eq!(f32_to_pcm16(0.0), 0);
        assert_eq!(f32_to_pcm16(1.0), i16::MAX);
    }

    #[test]
    fn wav_header_is_pcm16_mono_16khz() {
        let wav = encode_wav_pcm16(&[1, -2, 3], 16_000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 1);
        assert_eq!(
            u32::from_le_bytes([wav[24], wav[25], wav[26], wav[27]]),
            16_000
        );
        assert_eq!(u32::from_le_bytes([wav[40], wav[41], wav[42], wav[43]]), 6);
        assert_eq!(wav.len(), 50);
    }

    #[test]
    fn rolling_ring_slices_delayed_boundaries_by_cursor() {
        let mut buffer = StreamBuffer::default();
        buffer.ring.extend(0_i16..1_000_i16);
        buffer.next_sample_cursor = 1_000;
        truncate_ring(&mut buffer, 700);

        assert_eq!(buffer.ring_start_cursor, 300);
        assert_eq!(
            slice_ring(&buffer, 450, 455),
            Some(vec![450, 451, 452, 453, 454])
        );
        assert!(slice_ring(&buffer, 200, 455).is_none());
    }

    #[test]
    fn auto_scan_waits_for_eight_seconds_then_advances_six_seconds() {
        let mut buffer = StreamBuffer::default();
        buffer.ring.extend(vec![1_i16; AUTO_SCAN_WINDOW_SAMPLES]);
        buffer.next_sample_cursor = AUTO_SCAN_WINDOW_SAMPLES as u64;

        assert_eq!(
            next_auto_scan_window(&buffer),
            Some((0, AUTO_SCAN_WINDOW_SAMPLES as u64))
        );
        buffer.last_auto_scan_end_cursor = Some(buffer.next_sample_cursor);
        buffer
            .ring
            .extend(vec![1_i16; AUTO_SCAN_STEP_SAMPLES as usize - 1]);
        buffer.next_sample_cursor += AUTO_SCAN_STEP_SAMPLES - 1;
        assert_eq!(next_auto_scan_window(&buffer), None);

        buffer.ring.push_back(1);
        buffer.next_sample_cursor += 1;
        truncate_ring(
            &mut buffer,
            AUTO_SCAN_WINDOW_SAMPLES + AUTO_SCAN_STEP_SAMPLES as usize,
        );
        assert_eq!(
            next_auto_scan_window(&buffer),
            Some((AUTO_SCAN_STEP_SAMPLES, buffer.next_sample_cursor))
        );
    }

    #[test]
    fn automatic_scan_dedupes_overlapping_transcripts() {
        let manager = AiSttManager::new(200, 500, 12_000);

        assert!(!manager.should_skip_or_record_playback_text(
            StreamKind::Incoming,
            "Enemy on the left!",
            false
        ));
        assert!(manager.should_skip_or_record_playback_text(
            StreamKind::Incoming,
            "enemy, on the left",
            true
        ));
        assert!(!manager.should_skip_or_record_playback_text(
            StreamKind::Incoming,
            "Push the north gate",
            true
        ));
        assert!(manager.should_skip_or_record_playback_text(
            StreamKind::Incoming,
            "North gate",
            true
        ));
        assert!(!manager.should_skip_or_record_playback_text(
            StreamKind::Incoming,
            "Push the north gate and wait for the healer to arrive",
            true
        ));
        assert_eq!(
            normalize_transcript_for_dedupe("  HELLO...  เพื่อน! "),
            "hello เพื่อน"
        );
    }

    #[test]
    fn audio_cursor_is_monotonic_and_f9_keeps_the_full_clip() {
        let manager = AiSttManager::new(200, 500, 12_000);
        {
            let mut inner = manager.inner.lock().unwrap();
            inner.microphone.microphone_active = true;
        }
        let first = manager.ingest_audio(StreamKind::Microphone, &[0.25; 1_600]);
        let second = manager.ingest_audio(StreamKind::Microphone, &[0.5; 1_600]);

        assert_eq!(first.start_sample_cursor, 0);
        assert_eq!(first.end_sample_cursor, 1_600);
        assert_eq!(second.start_sample_cursor, 1_600);
        assert_eq!(second.end_sample_cursor, 3_200);
        let inner = manager.inner.lock().unwrap();
        assert_eq!(inner.microphone.microphone_samples.len(), 3_200);
        assert_eq!(inner.microphone.microphone_samples[0], f32_to_pcm16(0.25));
        assert_eq!(
            inner.microphone.microphone_samples[1_600],
            f32_to_pcm16(0.5)
        );
    }

    #[test]
    fn incoming_and_microphone_keep_independent_buffers_and_cursors() {
        let manager = AiSttManager::new(200, 500, 12_000);
        let incoming = manager.ingest_audio(StreamKind::Incoming, &[0.2; 1_600]);
        manager.ingest_audio(StreamKind::Microphone, &[0.3; 400]);

        assert_eq!(incoming.start_sample_cursor, 0);
        assert_eq!(incoming.end_sample_cursor, 1_600);
        let inner = manager.inner.lock().unwrap();
        assert_eq!(inner.incoming.next_sample_cursor, 1_600);
        assert_eq!(inner.microphone.next_sample_cursor, 400);
        assert_eq!(
            inner.incoming.ring.front().copied(),
            Some(f32_to_pcm16(0.2))
        );
    }

    #[test]
    fn microphone_silence_floor_rejects_only_near_silence() {
        assert!(rms_dbfs(&[0; 3_200]) < NEAR_SILENCE_DBFS);
        assert!(rms_dbfs(&[1_000; 3_200]) > NEAR_SILENCE_DBFS);
    }

    #[test]
    fn automatic_scan_keeps_original_pcm_amplitude() {
        let input = vec![100_i16, -200, 50];
        assert_eq!(automatic_scan_samples(input.clone()), input);
    }

    #[test]
    fn queue_accepts_running_and_one_waiting_only() {
        let queue = StreamQueue::default();
        assert!(queue.try_enqueue());
        assert!(queue.try_enqueue());
        assert!(!queue.try_enqueue());
    }

    #[test]
    fn rejects_only_consistently_low_confidence_segments() {
        let noisy = TranscriptionResponse {
            text: "Thank you for watching".into(),
            segments: vec![TranscriptionSegment {
                start: Some(0.0),
                end: Some(1.0),
                avg_logprob: Some(-1.5),
                no_speech_prob: Some(0.91),
                compression_ratio: Some(1.0),
            }],
        };
        assert!(noisy.is_low_confidence());

        let spoken = TranscriptionResponse {
            text: "Enemy on the left".into(),
            segments: vec![TranscriptionSegment {
                start: Some(0.0),
                end: Some(1.0),
                avg_logprob: Some(-0.35),
                no_speech_prob: Some(0.08),
                compression_ratio: Some(1.1),
            }],
        };
        assert!(!spoken.is_low_confidence());
    }

    #[test]
    fn adaptive_activity_gate_rejects_silence_and_constant_noise() {
        assert!(!has_adaptive_speech_activity(&vec![0; SAMPLE_RATE * 2]));
        assert!(!has_adaptive_speech_activity(&vec![2_000; SAMPLE_RATE * 2]));

        let mut speech_like = vec![100_i16; SAMPLE_RATE * 2];
        for sample in &mut speech_like[SAMPLE_RATE / 2..SAMPLE_RATE] {
            *sample = 6_000;
        }
        assert!(has_adaptive_speech_activity(&speech_like));
    }
