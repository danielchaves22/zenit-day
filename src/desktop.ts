import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { native, type Repository } from "./storage";
import { blankDoc, enqueue, priorityOf, type Priority } from "./model";

export const desktopAvailable =
  native && navigator.userAgent.includes("Windows");
export interface DesktopPreferences {
  autostart: boolean;
}
export interface CaptureRequest {
  id: string;
  namespace: string;
  title: string;
  priority?: Priority;
}
export interface CaptureContext {
  namespace: string | null;
  email: string;
}
export const desktopError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Não foi possível concluir. Tente novamente.";

// One writer owns the workspace, including captures from the second window.
export async function saveCapture(
  repo: Repository,
  userId: string,
  request: CaptureRequest,
) {
  if (request.namespace !== repo.key)
    throw new Error("A conta mudou. Abra novamente a captura rápida.");
  const title = request.title.trim();
  await repo.mutate((draft) => {
    const previous = draft.subjects[request.id];
    if (previous) {
      if (
        previous.title !== title ||
        priorityOf(previous) !== priorityOf(request)
      )
        throw new Error(
          "Este assunto já foi salvo. Abra o aplicativo para editá-lo, ou limpe o campo para criar outro.",
        );
      return; // A lost reply can be retried without creating another subject or operation.
    }
    enqueue(
      draft,
      userId,
      request.id,
      blankDoc(title, priorityOf(request)),
      null,
    );
  });
}

export function useDesktopIntegration(options: {
  namespace: string;
  email: string;
  todayCount: number;
  status: string;
  onToday: () => void;
  onCapture: (request: CaptureRequest) => Promise<void>;
}) {
  const latest = useRef(options);
  latest.current = options;
  const ready = useRef(false);
  const publish = () =>
    invoke("desktop_status", {
      namespace: latest.current.namespace,
      email: latest.current.email,
      todayCount: latest.current.todayCount,
      status: latest.current.status,
    });
  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    const unlisten: (() => void)[] = [];
    const takeToday = async () => {
      if (await invoke<boolean>("desktop_take_today")) latest.current.onToday();
    };
    void (async () => {
      const window = getCurrentWebviewWindow();
      unlisten.push(
        await window.listen<CaptureRequest>(
          "desktop-capture",
          async ({ payload }) => {
            if (cancelled) return;
            let error: string | null = null;
            try {
              await latest.current.onCapture(payload);
            } catch (e) {
              error = desktopError(e);
            }
            await invoke("desktop_capture_finish", { id: payload.id, error });
          },
        ),
      );
      unlisten.push(
        await window.listen("desktop-action", () => {
          void takeToday();
        }),
      );
      if (cancelled) {
        unlisten.forEach((fn) => fn());
        return;
      }
      ready.current = true;
      await publish();
      await takeToday();
    })().catch(console.error);
    return () => {
      cancelled = true;
      ready.current = false;
      unlisten.forEach((fn) => fn());
      void invoke("desktop_status", {
        namespace: null,
        email: "",
        todayCount: 0,
        status: "",
      }).catch(console.error);
    };
  }, [options.namespace]);
  useEffect(() => {
    if (desktopAvailable && ready.current) void publish().catch(console.error);
  }, [options.namespace, options.email, options.todayCount, options.status]);
}
