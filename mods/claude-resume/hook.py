#!/usr/bin/env python3
# Claude Code hook for the claude-resume Herdr mod (SessionStart + SessionEnd).
# Remembers which Claude session runs in which Herdr terminal:
#   $HERDR_APP_HOME/data/claude-resume/<HC_TERMINAL_ID>.json = {session, cwd, transcript}
# SessionEnd removes the entry only on a deliberate exit (/exit, ctrl-D, /logout),
# so a restart that kills Claude leaves it in place for the mod to resume.
import json
import os
import sys

APP = os.environ.get("HERDR_APP_HOME") or os.path.expanduser("~/.config/herdr-app")
DIR = os.path.join(APP, "data", "claude-resume")
DELIBERATE = {"prompt_input_exit", "logout"}

term = os.environ.get("HC_TERMINAL_ID")
if not term:
    sys.exit(0)
try:
    data = json.load(sys.stdin.buffer)  # bytes: Windows' console code page isn't UTF-8
except Exception:
    sys.exit(0)
if data.get("agent_id"):
    sys.exit(0)
sid = data.get("session_id")
event = data.get("hook_event_name")
path = os.path.join(DIR, f"{term}.json")

if event == "SessionStart" and sid:
    os.makedirs(DIR, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"session": sid, "cwd": data.get("cwd") or os.getcwd(),
                   "transcript": data.get("transcript_path")}, f)
    os.replace(tmp, path)
elif event == "SessionEnd" and data.get("reason") in DELIBERATE:
    try:
        # Close the file before removing it: Windows refuses to delete an open file.
        with open(path, encoding="utf-8") as f:
            mine = json.load(f).get("session") == sid
        if mine:
            os.remove(path)
    except Exception:
        pass
