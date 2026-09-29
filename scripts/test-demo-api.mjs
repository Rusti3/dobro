import { checkDemoApi } from '../tests/helpers/demo-api.mjs';
console.log(await checkDemoApi(process.env.DEMO_TEST_URL || 'http://127.0.0.1:3210'));
