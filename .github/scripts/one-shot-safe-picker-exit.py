from pathlib import Path

path = Path("js/app.js")
text = path.read_text()
old = '''    if (document.activeElement === els.picker && typeof els.picker.blur === "function") {
      els.picker.blur();
    }
'''
new = '''    if (typeof document !== "undefined") {
      if (document.activeElement === els.picker && typeof els.picker.blur === "function") {
        els.picker.blur();
      }
    }
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one picker blur block, found {text.count(old)}")
path.write_text(text.replace(old, new))
