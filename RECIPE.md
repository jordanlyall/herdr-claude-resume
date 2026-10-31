# Claude resume

Restarting your Mac kills every Claude Code chat. Herdr brings each pane back as a bare shell in its last folder, but it never re-runs the command, so your spaces come back blank. This mod brings the chats back. A small Claude Code hook remembers which session is running in which terminal. The first time Herdr starts after a boot, the mod types `claude --resume <session>` into each of those terminals that's sitting at a shell. A chip in the status bar shows how many chats it's holding, and "Resumed N" after a restart.

![Claude resume](preview.png)

## What you see

- One block in the status bar, about 130px wide, 12px text.
- Normally it reads `↻ 6 saved` in the theme's `dim` color: six chats would come back after a restart.
- After a boot pass it reads `↻ Resumed 5` in `accent`. The tooltip lists the `space / tab` of each pane it resumed.
- While a pass runs it reads `Resuming…`.

## How it behaves

- **Once per boot.** On start, the mod reads the boot time (`sysctl -n kern.boottime` on macOS, `btime` from `/proc/stat` on Linux) and compares it to `shared("claude-resume.boot")`. If they differ, it waits up to 2 minutes for herdr-core to list live terminals, waits 3 more seconds for the shells to settle, stores the new boot time, and runs one pass. Reloading the mod or reopening Herdr later in the same boot does nothing.
- **A pass** goes through each saved entry:
  - terminal gone (not `live` in `hc ls`): drops the entry
  - terminal running something other than a shell (`hc get` foreground isn't zsh, bash, fish or sh), or already running Claude: leaves it alone
  - transcript file missing: skips it
  - otherwise: `hc send <t> "cd '<cwd>' && claude --resume <id>"`. The chat opens idle and nothing re-runs until you type.
- **Clicking the chip** runs a pass right away. It's safe to click any time, because busy panes are skipped.
- **Which chats are saved:** every Claude session started inside a Herdr terminal. Exiting on purpose (`/exit`, ctrl-D, `/logout`) removes that chat, so chats you closed yourself don't come back. A restart, a crash, or closing the pane leaves the entry. A closed pane's entry is dropped on the next pass because the terminal is gone.
- The count refreshes every 30 s.

## Built from

- `mods/claude-resume/main.js`: one `View`. It uses `hc(["ls","--json"])`, `hc(["get",t,"--json"])`, `hc(["send",t,cmd])`, `exec("sysctl")`, `exec("test",["-f",path])`, `readTextFile`, `fs.readdir` / `fs.unlink` under `appHome()/data/claude-resume`, `shared` / `setShared`, `cx.sleep`, `cx.timer.every`, and theme colors `dim`, `accent`, `hover`, `foreground`.
- `mods/claude-resume/hook.py`: a Claude Code hook for **SessionStart** and **SessionEnd**. When `HC_TERMINAL_ID` is set, it writes `$HERDR_APP_HOME/data/claude-resume/<HC_TERMINAL_ID>.json` = `{session, cwd, transcript}` (default `~/.config/herdr-app`). On SessionEnd it deletes the entry only when `reason` is `prompt_input_exit` or `logout` and the session matches. It skips subagents (`agent_id`).
- Layout: one block in the status-bar row, e.g. `{"id": "status-resume", "type": "block", "content": {"mod": "claude-resume"}, "size": {"px": 130}}`.

**Installing also needs the hook.** Add it to the person's `~/.claude/settings.json` under `hooks`. Use the absolute path to the installed `hook.py`, append to any existing hook arrays rather than replacing them, and back the file up first:

```json
"SessionStart": [{ "hooks": [{ "type": "command", "command": "/usr/bin/python3 ~/.config/herdr-app/mods/claude-resume/hook.py", "timeout": 5 }] }],
"SessionEnd":   [{ "hooks": [{ "type": "command", "command": "/usr/bin/python3 ~/.config/herdr-app/mods/claude-resume/hook.py", "timeout": 5 }] }]
```

Chats already open when you install weren't seen by the hook. They're covered after their next start or `/resume`.

## Watch out

- **The mod only runs while its block is in the shown layout.** If it lives in a hidden column, it still runs (Herdr keeps hidden copies alive). If it's in no layout, nothing happens.
- **Herdr has to open after the restart.** Add Herdr to Login Items to make this automatic. Otherwise the pass runs whenever you first open Herdr in that boot.
- **`hc send` from inside a Herdr terminal wraps the text in `<hc from="tN">…</hc>`** (that's meant for agents), and a shell chokes on it. The mod runs in the app, so its sends are plain. If you test from a terminal, use `env -u HC_TERMINAL_ID hc send …`.
- The session id gets typed into a shell, so the mod only sends ids that match `^[0-9a-f-]{36}$`. The cwd is single-quoted.
- A folder Claude hasn't been told to trust stops at the trust prompt. Folders you already worked in are trusted.
- It runs programs (`hc`, `sysctl`, `test`), and the hook writes outside the mod folder (`data/claude-resume/`). It never reaches the network.
- Tested on macOS with zsh. The Linux boot-time path is written but untested.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/claude-resume` passes and `herdr-app status` shows `errors: []`.
- Starting `claude` in a Herdr pane creates `~/.config/herdr-app/data/claude-resume/<terminal>.json` holding that session id. `/exit` removes it.
- With a saved entry for a terminal sitting at a bare shell, clicking the chip types `cd '<cwd>' && claude --resume <id>` there, Claude opens on that chat, and the chip reads `↻ Resumed 1`.
- Terminals already running Claude, or any other program, are left untouched by a pass.
- After a real restart, the panes that had chats open come back running them without a click.
