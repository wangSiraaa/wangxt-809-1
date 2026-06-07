# Trae Preflight

This folder is prepared for `wangxt-809-1`.

Use `.env` for stable local ports and compose project identity:

- APP_PORT: 18109
- API_PORT: 19109
- WEB_PORT: 20109
- DB_PORT: 21109
- REDIS_PORT: 22109

Smoke entry:

```bash
bash scripts/smoke.sh
```

The preflight files are environment scaffolding only. The generated business
project can replace or extend them when needed.
