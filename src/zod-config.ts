import { z } from 'zod';

// The CSP forbids eval. Jitless mode stops Zod probing `new Function` when schemas are built, which would log a CSP issue.
// Import this module before any module that defines schemas.
z.config({ jitless: true });
