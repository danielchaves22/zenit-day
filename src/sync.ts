import { acknowledge, mergeRemote, validateSubject } from "./model";
import type { Api } from "./api";
import type { Repository } from "./storage";
export class Synchronizer {
  private running: Promise<void> | null = null;
  private stopped = false;
  constructor(
    private repo: Repository,
    private api: Api,
    private userId: string,
  ) {}
  stop() {
    this.stopped = true;
  }
  run(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.perform().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async perform() {
    if (this.api.session?.user.id !== this.userId) return;
    await this.api.ready();
    // Bound a pass so continuous typing cannot starve the remote read.
    for (let i = 0; i < 100 && !this.stopped; i++) {
      const op = this.repo.current.queue.find(
        (o) => !this.repo.current.conflicts[o.subjectId],
      );
      if (!op) break;
      if (this.api.session?.user.id !== this.userId) return;
      const result = await this.api.save(op);
      if (this.stopped) return;
      if (result.result === "saved" && result.subject) {
        const subject = result.subject;
        await this.repo.mutate((w) => acknowledge(w, op, subject, this.userId));
      } else if (result.result === "conflict") {
        if (result.subject) {
          validateSubject(result.subject, this.userId);
          if (result.subject.id !== op.subjectId)
            throw new Error("Conflito inválido.");
        }
        await this.repo.mutate((w) => {
          w.conflicts[op.subjectId] = {
            remote: result.subject,
            detectedAt: new Date().toISOString(),
          };
        });
      } else throw new Error("Resposta de gravação inválida.");
    }
    if (this.stopped || this.api.session?.user.id !== this.userId) return;
    const [subjects, history] = await Promise.all([
      this.api.subjects(),
      this.api.history(),
    ]);
    if (!this.stopped)
      await this.repo.mutate((w) =>
        mergeRemote(w, subjects, history, this.userId),
      );
  }
}
