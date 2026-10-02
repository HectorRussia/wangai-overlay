//! Bounded scheduling and gateway requests. Pure policies live in sibling modules.
use super::*;

impl AiSttManager {
    pub(super) fn enqueue_job(&self, app: AppHandle, utterance: SttJob) -> bool {
        if app.state::<AppState>().lifecycle.is_closing() {
            return false;
        }
        let stream = utterance.stream;
        if !app
            .state::<AppState>()
            .gateway
            .accepts_started_at(utterance.started_at_ms)
        {
            return false;
        }
        let automatic_cloud_scan = utterance.automatic_cloud_scan;

        let queue = self.queue(stream);
        if !queue.try_enqueue() {
            if automatic_cloud_scan {
                let _ = app.emit(
                    "pipeline-status",
                    "ข้ามรอบ Auto Cloud Scan เพราะ บริการ AI ยังประมวลผลรอบก่อนอยู่",
                );
            } else {
                report_stt_error(&app, "ระบบตามเสียงไม่ทัน: คิวถอดเสียงเต็ม");
            }
            return false;
        }

        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let permit = queue
                .semaphore
                .acquire()
                .await
                .expect("STT semaphore closed");
            if app.state::<AppState>().lifecycle.is_closing()
                || manager.generation(utterance.stream) != utterance.generation
            {
                drop(permit);
                queue.queued.fetch_sub(1, Ordering::AcqRel);
                return;
            }

            let busy = manager.busy_jobs.fetch_add(1, Ordering::AcqRel) + 1;
            set_stt_busy(&app, busy > 0, "กำลังส่งเสียงให้ บริการ AI");
            let result = match manager.process_job(&app, utterance).await {
                Ok(Some(completed)) => {
                    crate::application::transcripts::handle_transcript_event(app.clone(), completed.transcript, completed.generation).await;
                    Ok(())
                }
                Ok(None) => Ok(()),
                Err(error) => Err(error),
            };
            let remaining_busy = manager.busy_jobs.fetch_sub(1, Ordering::AcqRel) - 1;
            drop(permit);
            queue.queued.fetch_sub(1, Ordering::AcqRel);

            match result {
                Ok(()) => set_stt_busy(&app, remaining_busy > 0, "บริการ AI พร้อมใช้งาน"),
                Err(error) => {
                    set_stt_busy(&app, remaining_busy > 0, "ถอดเสียงด้วย บริการ AI ไม่สำเร็จ");
                    report_stt_error(&app, &error.to_string());
                }
            }
        });
        true
    }

    pub(super) async fn process_job(&self, app: &AppHandle, job: SttJob) -> Result<Option<CompletedTranscription>> {
        let state = app.state::<AppState>();
        if !state.gateway.accepts_started_at(job.started_at_ms) {
            return Ok(None);
        }
        let language = match job.stream {
            StreamKind::Incoming => "en",
            StreamKind::Microphone => "th",
        };
        if job.automatic_cloud_scan && !has_adaptive_speech_activity(&job.samples) {
            let _ = app.emit(
                "pipeline-status",
                format!(
                    "ข้าม {:?} rescue scan: ไม่พบช่วงเสียงพูดที่เด่นจาก noise floor",
                    job.stream
                ),
            );
            return Ok(None);
        }
        let transcription: TranscriptionResponse = state
            .gateway
            .transcribe(
                encode_wav_pcm16(&job.samples, SAMPLE_RATE as u32),
                if job.stream == StreamKind::Incoming {
                    "incoming"
                } else {
                    "microphone"
                },
            )
            .await?;

        if self.generation(job.stream) != job.generation {
            return Ok(None);
        }
        if transcription.is_low_confidence() {
            if job.diagnostic_probe {
                report_probe_result(
                    app,
                    job.stream,
                    "บริการ AI ไม่พบเสียงพูดใน 6 วินาทีล่าสุด แปลว่า endpoint นี้มีเสียงเกมแต่ไม่มีเสียงเพื่อนที่ชัดเจน",
                );
            }
            let _ = app.emit(
                "pipeline-status",
                "ข้ามเสียงที่ Whisper ประเมินว่าไม่ชัดหรือไม่ใช่คำพูด",
            );
            return Ok(None);
        }
        let text = transcription.text.trim();
        if text.is_empty() {
            if job.diagnostic_probe {
                report_probe_result(
                    app,
                    job.stream,
                    "บริการ AI ได้เสียงจาก endpoint แล้ว แต่ผลถอดเสียง 6 วินาทีล่าสุดว่างเปล่า",
                );
            }
            let _ = app.emit("pipeline-status", "ข้ามผลถอดเสียงว่างจาก บริการ AI");
            return Ok(None);
        }
        if job.diagnostic_probe {
            report_probe_result(
                app,
                job.stream,
                &format!("บริการ AI ได้ยินเสียงพูดจาก endpoint นี้: {text}"),
            );
        }
        if job.stream != StreamKind::Microphone
            && self.should_skip_or_record_playback_text(job.stream, text, job.automatic_cloud_scan)
        {
            let _ = app.emit("pipeline-status", "ข้ามข้อความซ้ำจาก Auto Cloud Scan");
            return Ok(None);
        }
        let ended_at_ms = chrono::Utc::now().timestamp_millis();
        let transcript = TranscriptEvent {
            segment_id: job.segment_id,
            stream: job.stream,
            source_display_name: job.source_display_name,
            language: language.into(),
            text: text.into(),
            kind: TranscriptKind::Final,
            started_at_ms: job.started_at_ms,
            ended_at_ms,
        };
        Ok(Some(CompletedTranscription { transcript, generation: job.generation }))
    }
}
