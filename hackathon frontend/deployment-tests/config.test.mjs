import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeploymentEnv} from '../deployment.config.ts';

const valid={VITE_DEPLOYMENT:'production',VITE_USE_MOCK:'false',VITE_API_BASE_URL:'https://api.example.test'};
test('public deployment accepts HTTPS and keeps local development available',()=>{
  assert.doesNotThrow(()=>validateDeploymentEnv(valid));
  assert.doesNotThrow(()=>validateDeploymentEnv({}));
});
for(const patch of [{VITE_USE_MOCK:'true'},{VITE_API_BASE_URL:''},{VITE_API_BASE_URL:'http://localhost:8000'},{VITE_API_BASE_URL:'https://localhost'},{VITE_API_BASE_URL:'https://secret:password@example.test'},{VITE_API_BASE_URL:'https://api.example.test/api'},{VITE_GEMINI_API_KEY:'not-a-real-key'},{VITE_SUPABASE_SERVICE_KEY:'not-a-real-key'},{VITE_SUPABASE_SERVICE_ROLE_KEY:'not-a-real-key'},{VITE_GOOGLE_API_KEY:'not-a-real-key'}]) {
  test('unsafe deployment configuration is rejected: '+Object.keys(patch).join(','),()=>{
    assert.throws(()=>validateDeploymentEnv({...valid,...patch}));
  });
}
