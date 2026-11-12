# AgentProof evidence viewer

`index.html` is a static page that shows every AgentProof run read from committed evidence:

1. **Follow the dollar:** three runs of the same job (ohwow pass, CEOClaw's wrong-delivery fixture, a price over the buyer's cap) and where the money stopped.
2. **Two gates:** the buyer's cap in the job envelope and the seller owner's cap (ohwow spend policy, TASK-008), on one log ruler.
3. **Try to cheat the checker:** `checker.js` is a line-for-line port of `task-002/checker.py`. Edit a delivered field and see which step catches it.
4. **Seals:** each evidence_digest drawn as 256 dots and recomputed in the browser against checker.py's committed result.

```
python3 viz/build.py      # snapshot evidence files (git show <ref>:<path>) into viz/data.js
node viz/verify.mjs       # checker.js == checker.py on 33 cases + the 3 committed results
python3 -m http.server -d viz 8787   # open http://127.0.0.1:8787
```

The market leg is still a dry run. After Patriot's live $1 hire, add its market-job-ref to `build.py` and the hero shows the real job.
