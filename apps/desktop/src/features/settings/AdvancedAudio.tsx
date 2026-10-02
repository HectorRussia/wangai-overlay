import { Cpu, Volume2, TriangleAlert, RefreshCw, Save } from "lucide-react";
import { api } from "../../api";
import { Slider } from "../../shared/ui/Slider";
import type {
  AppSettings,
  RuntimeState,
  VadSettings,
  AudioOutputDevice,
} from "../../types";
import type { CommandTask } from "../../shared/useCommandTask";
import { Card, Info } from "./AdvancedControls";
import { button, primary, input } from "./advancedStyles";

export function AdvancedAudio({
  settings,
  runtime,
  vad,
  setVad,
  devices,
  busy,
  run,
  onPick,
}: {
  settings: AppSettings;
  runtime: RuntimeState;
  vad: VadSettings;
  setVad: (value: VadSettings) => void;
  devices: AudioOutputDevice[];
  busy?: string;
  run: CommandTask;
  onPick: () => void;
}) {
  const profileKey =
    settings.captureMode === "process_tree" ? "processTree" : "systemOutput";
  const profile = vad[profileKey];
  return (
    <section className="space-y-4">
      <Card
        title="Incoming audio diagnostics"
        icon={<Volume2 />}
        subtitle="มี capture, ring, cursor, VAD และ AI queue เพียงชุดเดียว"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Info
            label="แอปที่เลือก"
            value={settings.listeningSource?.displayName ?? "ยังไม่ได้เลือก"}
          />
          <Info label="สถานะ" value={runtime.statusMessage} />
          <Info
            label="PID ที่จับจริง"
            value={runtime.effectiveCapturePid?.toString() ?? "—"}
          />
          <Info
            label="Peak"
            value={
              runtime.audioPeakDbfs == null
                ? "ยังไม่มี audio frame"
                : `${runtime.audioPeakDbfs.toFixed(1)} dBFS`
            }
          />
          <Info
            label="VAD"
            value={runtime.vadActive ? "กำลังตรวจพบคำพูด" : "ยังไม่พบคำพูด"}
          />
          <Info
            label="Source badge"
            value={
              settings.captureMode === "system_output"
                ? "MIXED"
                : (settings.listeningSource?.displayName?.toUpperCase() ??
                  "INCOMING")
            }
          />
        </div>
        {runtime.captureWarning && (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            <TriangleAlert className="mr-2 inline size-4" />
            {runtime.captureWarning}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={button} onClick={onPick}>
            เปลี่ยนแอป
          </button>
          <button
            className={button}
            disabled={busy === "probe"}
            onClick={() =>
              void run(
                "probe",
                api.probeRecentAudio,
                "ส่งเสียง 6 วินาทีล่าสุดไปตรวจแล้ว",
              )
            }
          >
            ตรวจเสียง 6 วินาที
          </button>
          <button
            className={button}
            onClick={() =>
              void run("worker", api.restartWorker, "Restart worker แล้ว")
            }
          >
            <RefreshCw />
            Restart worker
          </button>
        </div>
      </Card>
      <Card
        title="Capture mode"
        icon={<Cpu />}
        subtitle="Process Tree จับเฉพาะแอป; System Output เป็น fallback และแสดง MIXED"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <button
            className={
              settings.captureMode === "process_tree" ? primary : button
            }
            onClick={() =>
              void run(
                "mode",
                () => api.updateCaptureMode("process_tree"),
                "ใช้ Process Tree แล้ว",
              )
            }
          >
            Process Tree
          </button>
          <button
            className={
              settings.captureMode === "system_output" ? primary : button
            }
            onClick={() =>
              void run(
                "mode",
                () => api.updateCaptureMode("system_output"),
                "ใช้ System Output แล้ว",
              )
            }
          >
            System Output fallback
          </button>
        </div>
        {settings.captureMode === "system_output" && (
          <label className="mt-4 block text-sm">
            Output endpoint
            <select
              className={`${input} mt-2`}
              value={settings.outputDeviceId ?? ""}
              onChange={(event) =>
                void run(
                  "device",
                  () => api.updateOutputDevice(event.target.value || undefined),
                  "เปลี่ยน output endpoint แล้ว",
                )
              }
            >
              <option value="">Windows default</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                  {device.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input
            checked={settings.rescueScanEnabled}
            type="checkbox"
            onChange={(event) =>
              void run(
                "rescue",
                () => api.updateRescueScan(event.target.checked),
                event.target.checked
                  ? "เปิด Rescue Scan แล้ว"
                  : "ปิด Rescue Scan แล้ว",
              )
            }
          />
          Rescue Scan (ปิดเป็นค่าเริ่มต้น)
        </label>
      </Card>
      <Card
        title="Local Silero VAD"
        icon={<Cpu />}
        subtitle={`โปรไฟล์ ${settings.captureMode === "process_tree" ? "Process Tree" : "System Output"} จำค่าแยกกัน`}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Slider
            inputClassName="mt-3 w-full accent-[#63c48b]"
            label="VAD threshold"
            min={0.05}
            max={0.9}
            step={0.05}
            value={profile.vadThreshold}
            display={profile.vadThreshold.toFixed(2)}
            onChange={(value) =>
              setVad({
                ...vad,
                [profileKey]: { ...profile, vadThreshold: value },
              })
            }
          />
          <Slider
            inputClassName="mt-3 w-full accent-[#63c48b]"
            label="VAD gain"
            min={0}
            max={18}
            step={1}
            value={profile.gainDb}
            display={`+${profile.gainDb} dB`}
            onChange={(value) =>
              setVad({
                ...vad,
                [profileKey]: { ...profile, gainDb: value },
              })
            }
          />
          <Slider
            inputClassName="mt-3 w-full accent-[#63c48b]"
            label="จบเมื่อเงียบ"
            min={200}
            max={1500}
            step={100}
            value={vad.silenceMs}
            display={`${vad.silenceMs} ms`}
            onChange={(value) => setVad({ ...vad, silenceMs: value })}
          />
          <Slider
            inputClassName="mt-3 w-full accent-[#63c48b]"
            label="Pre-roll"
            min={0}
            max={1000}
            step={50}
            value={vad.preRollMs}
            display={`${vad.preRollMs} ms`}
            onChange={(value) => setVad({ ...vad, preRollMs: value })}
          />
        </div>
        <button
          className={`${primary} mt-5`}
          onClick={() =>
            void run("vad", () => api.updateVad(vad), "บันทึก VAD แล้ว")
          }
        >
          <Save />
          บันทึกและ Restart
        </button>
      </Card>
    </section>
  );
}
