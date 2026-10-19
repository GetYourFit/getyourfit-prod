import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
os.homedir = () => process.env.GYF_TOOL_HOME;
syncBuiltinESMExports();
