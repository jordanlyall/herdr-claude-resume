// Claude resume: brings Claude Code chats back after a restart.
// A restart kills every program; Herdr brings each pane back as a bare shell in its last
// folder and never re-runs the command. hook.py (a Claude Code hook) keeps
// data/claude-resume/<terminal>.json = which session runs in which terminal. Once per boot,
// this types `claude --resume <id>` into each saved terminal that is live and at a shell.
// Busy terminals are left alone; entries for terminals that are gone are dropped.
// Status-bar chip: "↻ N chats" normally; "↻ Resumed N" for 10 minutes after a pass (click
// dismisses it); "↻ set up" in amber when the hook is missing. Click otherwise = a pass now.
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, hc, home, appHome, readTextFile, shared, setShared, theme } from "herdr";
import * as fs from "fs/promises";

const DIR = () => `${appHome()}/data/claude-resume`;
const SHELLS = new Set(["zsh", "-zsh", "bash", "-bash", "fish", "-fish", "sh"]);
const BOOT_KEY = "claude-resume.boot";

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const json = (r) => { try { return r?.code === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } };

async function bootTime() {
  const r = await exec("sysctl", ["-n", "kern.boottime"]).catch(() => null);
  return r?.stdout.match(/sec = (\d+)/)?.[1] ?? null;
}

// The hook is what saves chats; without it the chip would sit at "0 chats" looking fine.
async function hookInstalled() {
  const s = await readTextFile(`${home()}/.claude/settings.json`).catch(() => null);
  return Boolean(s?.includes("claude-resume/hook.py"));
}

async function entries() {
  const out = [];
  for (const f of await fs.readdir(DIR()).catch(() => [])) {
    if (!f.endsWith(".json")) continue;
    try { out.push({ term: f.slice(0, -5), file: `${DIR()}/${f}`, ...JSON.parse(await readTextFile(`${DIR()}/${f}`)) }); } catch {}
  }
  return out;
}

async function liveTerminals() {
  const ls = json(await hc(["ls", "--json"]).catch(() => null));
  if (!ls?.terminals) return null;
  return new Map(ls.terminals.filter((t) => t.state === "live").map((t) => [t.address, t]));
}

// One pass: returns what it did per terminal.
async function pass() {
  const live = await liveTerminals();
  if (!live) return null;
  const done = [];
  for (const e of await entries()) {
    const t = live.get(e.term);
    if (!/^[0-9a-f-]{36}$/i.test(e.session ?? "")) continue; // typed into a shell: ids only
    if (!t) { await fs.unlink(e.file).catch(() => {}); continue; }
    const info = json(await hc(["get", e.term, "--json"]).catch(() => null));
    const fg = info?.foreground?.name ?? "";
    if (!SHELLS.has(fg) || t.agent === "claude-code") continue;
    if (e.transcript && (await exec("test", ["-f", e.transcript]).catch(() => null))?.code !== 0) continue;
    await hc(["send", e.term, `cd ${quote(e.cwd || "~")} && claude --resume ${e.session}`]).catch(() => null);
    done.push(t.where || e.term);
  }
  return done;
}

const SHOW_RESUMED_MS = 10 * 60 * 1000;

export default class ClaudeResume extends View {
  init(_props, cx) {
    this.saved = 0; this.resumed = null; this.resumedAt = 0; this.busy = false; this.hook = true;
    cx.timer.every(30000, (cx) => this.count(cx));
    this.count(cx);
    cx.spawn(async (cx) => {
      const boot = await bootTime();
      if (!boot || shared(BOOT_KEY) === boot) return;
      // First start after a boot: wait for herdr-core to bring the terminals back.
      for (let i = 0; i < 60 && !(await liveTerminals())?.size; i++) await cx.sleep(2000);
      await cx.sleep(3000);
      setShared(BOOT_KEY, boot);
      await this.run(cx);
    });
  }

  count(cx) {
    cx.spawn(async (cx) => {
      [this.saved, this.hook] = [(await entries()).length, await hookInstalled()];
      if (this.resumed && Date.now() - this.resumedAt > SHOW_RESUMED_MS) this.resumed = null;
      cx.notify();
    });
  }

  async run(cx) {
    if (this.busy) return;
    this.busy = true; cx.notify();
    const done = await pass();
    this.busy = false;
    if (done?.length) { this.resumed = done; this.resumedAt = Date.now(); }
    this.saved = (await entries()).length;
    cx.notify();
  }

  click(cx) {
    if (this.resumed) { this.resumed = null; cx.notify(); return; }
    cx.spawn(async (cx) => this.run(cx));
  }

  render() {
    const t = theme();
    const n = this.resumed?.length ?? 0;
    const chats = `${this.saved} Claude chat${this.saved === 1 ? "" : "s"}`;
    const [label, color, tip] =
      this.busy ? ["↻ Resuming…", t.dim, "Typing claude --resume into panes at a bare shell"]
      : n ? [`↻ Resumed ${n}`, t.accent, `Resumed:\n${this.resumed.join("\n")}\n\nClick to dismiss.`]
      : !this.hook ? ["↻ set up", t.blocked ?? t.ansi3,
          "Chats aren't being saved: the Claude Code hook isn't installed.\nAdd mods/claude-resume/hook.py to ~/.claude/settings.json\nunder SessionStart and SessionEnd (see the mod's RECIPE.md)."]
      : [`↻ ${this.saved} chat${this.saved === 1 ? "" : "s"}`, t.dim,
          `${chats} will come back after a restart.\nClick to resume any sitting at a bare shell now.`];
    return h_flex().size_full().items_center().px(8).text_size(12)
      .child(div().id("claude-resume").tooltip(tip).px(6).rounded(4).cursor_pointer()
        .text_color(color)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_, cx) => this.click(cx))
        .child(label));
  }
}
