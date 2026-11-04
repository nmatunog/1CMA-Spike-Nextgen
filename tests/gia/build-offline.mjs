import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
// Verification workaround for environments where the existing Google Font is blocked.
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env:{...process.env,NEXT_FONT_GOOGLE_MOCKED_RESPONSES:resolve('tests/gia/font-mock.cjs')}});
process.exit(result.status || (result.error ? 1 : 0));
