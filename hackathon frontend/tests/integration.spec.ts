import {test, expect, type Page, type APIRequestContext} from '@playwright/test';
import {createHmac} from 'node:crypto';

const API = 'http://127.0.0.1:8011';
const password = 'synthetic-test-password';

async function token(request:APIRequestContext, user='demo-citizen-1') {
  const response=await request.post(API+'/api/v1/auth/login',{data:{user_id:user,password}});
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function login(page:Page, user='demo-citizen-1') {
  await page.goto('/login');
  await page.locator('input[autocomplete="username"]').fill(user);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp('/'+(user.includes('admin')?'admin':user.includes('officer')?'officer':user.includes('helper')?'helper':'citizen')+'$'));
}

function wave():Buffer {
  const body=Buffer.alloc(16000);
  const h=Buffer.alloc(44);
  h.write('RIFF');h.writeUInt32LE(36+body.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(8000,24);h.writeUInt32LE(16000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(body.length,40);
  return Buffer.concat([h,body]);
}

test('real login and the complete saved voice complaint flow',async({page,request})=>{
  await login(page);
  await page.goto('/citizen/new');
  const panel=page.getByRole('region',{name:'Saved complaint voice input'});
  await panel.getByLabel('Upload Urdu recording').setInputFiles({name:'synthetic.wav',mimeType:'audio/wav',buffer:wave()});
  await panel.getByRole('checkbox').filter({visible:true}).first().check();
  const voiceResponse=page.waitForResponse(r=>r.url().endsWith('/voice-inputs')&&r.request().method()==='POST');
  await panel.getByRole('button',{name:'Transcribe recording',exact:true}).click();
  const voice=await voiceResponse; expect(voice.ok()).toBeTruthy();
  const turn=await voice.json();
  expect(turn.status).toBe('READY');
  expect(turn.extraction.incident_data.amount).toBe(1500);
  const auth=await token(request);
  const headers={Authorization:'Bearer '+auth};
  const before=await request.get(API+'/api/v1/complaints/'+turn.complaint_id,{headers});
  const beforeFacts=(await before.json()).incident_data;
  expect(beforeFacts.amount).toBeNull();
  expect(beforeFacts.money_lost).toBeNull();
  expect(beforeFacts.currency).toBeNull();
  await expect(panel.getByLabel('Reviewed voice facts')).toBeVisible();
  await panel.getByText('I reviewed these fields and want to apply these corrections.').click();
  await panel.getByRole('button',{name:'Apply reviewed voice facts'}).click();
  await expect(page.locator('#incident-description')).toHaveValue(/Citizen reports a synthetic fake aid message/);
  const afterConfirmation=await (await request.get(API+'/api/v1/complaints/'+turn.complaint_id,{headers})).json();
  expect(afterConfirmation.incident_data.citizen_confirmed_corrections || []).toEqual([]);
  await page.getByText('I permit this saved complaint to be sent to Gemini for analysis. This does not authorize filing.').click();
  const analyzed=page.waitForResponse(r=>r.url().endsWith('/analyze')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Save & Analyze with AI'}).click();
  expect((await (await analyzed).json()).current_status).toBe('CITIZEN_REVIEW');
  await page.getByRole('button',{name:/Continue.*Review|Review.*Consent/i}).click();
  const review=page.getByRole('region',{name:'Spoken Urdu Complaint Summary',exact:true});
  await review.getByRole('checkbox').check();
  const spokenResponse=page.waitForResponse(r=>r.url().endsWith('/speech')&&r.request().method()==='POST');
  await review.getByRole('button',{name:'Generate Urdu audio'}).click();
  const spoken = await spokenResponse;
  expect(spoken.ok()).toBeTruthy();
  expect((await spoken.json()).text_ur).not.toMatch(/[A-Za-z]/);
  await expect(review.getByTestId('saved-urdu-speech')).not.toContainText('Citizen reports');
  await expect(review.locator('audio')).toHaveAttribute('src',/^blob:/);
  await expect.poll(()=>review.locator('audio').evaluate((a:HTMLAudioElement)=>a.readyState)).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/voice-review.png',fullPage:true});
  const consent=page.getByRole('region',{name:'Data sharing consent'});
  await expect(page.getByRole('button',{name:/Authorize & Submit/})).toBeDisabled();
  await consent.getByRole('checkbox', {name:/I allow the listed required recipients/}).check();
  await consent.getByRole('button', {name:'Allow required sharing',exact:true}).click();
  await expect(consent.getByText(/All required sharing permissions are ready/)).toBeVisible();
  await page.getByText(/I reviewed this complaint summary and explicitly authorize/).click();
  const executionResponse=page.waitForResponse(r=>r.url().endsWith('/submit')&&r.request().method()==='POST');
  await page.getByRole('button',{name:/Authorize & Submit/}).click();
  const execution=await executionResponse;expect(execution.ok()).toBeTruthy();
  const receipt=await execution.json();expect(receipt.submitted).toBe(true);
  await expect(page.getByText('Simulated Complaint Submitted',{exact:true})).toBeVisible();
  await expect(page.getByText(receipt.submission_reference,{exact:true})).toBeVisible();
  const record=await request.get(API+'/api/v1/complaints/'+turn.complaint_id,{headers});
  expect((await record.json()).submission_reference).toBe(receipt.submission_reference);
  await page.getByRole('link',{name:'Start a new report',exact:true}).click();
  await expect(page.locator('#incident-description')).toHaveValue('');
  await expect(page.getByText('Simulated Complaint Submitted',{exact:true})).toHaveCount(0);
});

async function ready(request:APIRequestContext, filed=false, reference: string | null = null) {
  const auth=await token(request);
  const headers={Authorization:'Bearer '+auth};
  const created=await request.post(API+'/api/v1/complaints',{headers,data:{description:'Synthetic browser case '+crypto.randomUUID(),money_lost:true,amount:1500,currency:'PKR',incident_date:null,transaction_reference:reference}});
  expect(created.ok()).toBeTruthy();
  const id=(await created.json()).complaint_id;
  const root=API+'/api/v1/complaints/'+id;
  const analyzed=await request.post(root+'/analyze',{headers,data:{allow_external_processing:true}});
  expect((await analyzed.json()).current_status).toBe('CITIZEN_REVIEW');
  for(const grant of [
    {recipient:'workspace:mock-financial-fraud',purpose:'complaint_submission',data_scopes:['case_status','incident_data','evidence']},
    {recipient:'service:mock-identity',purpose:'mock_identity_check',data_scopes:['case_status','identity_reference']},
    {recipient:'service:mock-data',purpose:'mock_requirements_lookup',data_scopes:['case_status','incident_data.incident_type']},
  ]) expect((await request.post(root+'/consents',{headers,data:grant})).ok()).toBeTruthy();
  if(filed){
    const current=await (await request.get(root,{headers})).json();
    const approved=await request.post(root+'/authorize-submission',{headers,data:{citizen_confirmed:true,citizen_authorized:true,reviewed_version:current.version}});
    const approval=await approved.json();
    expect(approved.ok()).toBeTruthy();
    const execution=await request.post(root+'/submit',{headers:{...headers,'Idempotency-Key':crypto.randomUUID()},data:{authorization_id:approval.authorization_id}});
    expect((await execution.json()).submitted).toBe(true);
  }
  return {id,root,headers};
}

test('Admin assigns; officer requests information; citizen replies; officer accepts and closes',async({page,request})=>{
  const {id,root,headers}=await ready(request,true);
  const permissions=await (await request.get(root+'/consents',{headers})).json();
  const workspace=permissions.find((row:{purpose:string})=>row.purpose==='complaint_submission');
  const fields=['incident_type','incident_date','description','amount','currency','payment_method','transaction_reference','suspect_details'];
  expect((await request.patch(API+'/api/v1/consents/'+workspace.consent_id,{headers,data:{data_scopes:['case_status',...fields.map(field=>'incident_data.'+field)]}})).ok()).toBe(true);
  await login(page,'demo-admin');
  const queue=page.getByRole('region',{name:'Submitted case assignment queue'});
  const card=queue.getByRole('article',{name:'Submitted case '+id,exact:true});
  await expect(card).toBeVisible();
  const choices=card.getByRole('combobox');
  await expect(choices).toHaveValue('demo-officer-financial');
  await expect(choices.locator('option')).toHaveCount(1);
  await expect(queue.locator('input')).toHaveCount(0);
  const assigned=page.waitForResponse(r=>r.url().endsWith('/assignment')&&r.request().method()==='POST');
  await card.getByRole('button',{name:'Assign officer',exact:true}).click();
  expect((await assigned).ok()).toBeTruthy();
  await expect(card).toHaveCount(0);
  await queue.getByLabel('Assignment queue filter').selectOption('assigned');
  await expect(card.locator('dd').filter({hasText:'demo-officer-financial'})).toBeVisible();
  await page.evaluate(()=>sessionStorage.clear());
  await login(page,'demo-officer-financial');
  await page.goto('/officer/complaints/'+id);
  await page.locator('#officer-reason').fill('Please clarify the synthetic contact channel.');
  const decision=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Request Information',exact:true}).click();
  expect((await decision).ok()).toBeTruthy();
  await page.evaluate(()=>sessionStorage.clear());
  await login(page);
  await page.goto('/citizen/complaints/'+id);
  await page.getByLabel('Reply to officer').fill('The synthetic message arrived by SMS.');
  await page.getByText('I permit sharing this clarification with the assigned officer.').click();
  const replied=page.waitForResponse(r=>r.url().endsWith('/review-response')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Send citizen clarification'}).click();
  expect((await replied).ok()).toBeTruthy();
  await page.evaluate(()=>sessionStorage.clear());
  await login(page,'demo-officer-financial');
  await page.goto('/officer/complaints/'+id);
  for(const [action,reason]of [['Accept','Synthetic details reviewed.'],['Close Case','Synthetic review completed.']]) {
    await page.locator('#officer-reason').fill(reason);
    const actionResponse=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');
    await page.getByRole('button',{name:action,exact:true}).click();
    expect((await actionResponse).ok()).toBeTruthy();
  }
  const current=await (await request.get(root,{headers})).json();
  expect(current.current_status).toBe('RESOLVED');expect(current.review_outcome).toBe('closed');
  await page.evaluate(()=>sessionStorage.clear());
  await login(page,'demo-admin');
  await page.goto('/admin?tab=audit&complaint='+id);
  await expect(page.getByText('Safe audit and agent trace',{exact:true})).toBeVisible();
  await expect(page.getByText('Synthetic details reviewed.',{exact:true})).toHaveCount(0);
});

test('a receipt lookup outage never creates a display reference and recovers the same filing',async({page,request})=>{
  const {id}=await ready(request);
  await login(page);
  await page.goto('/citizen/complaints/'+id+'/wizard');
  await page.getByText(/I reviewed this complaint summary and explicitly authorize/).click();
  const receiptPath='**/api/v1/mock/complaints/by-idempotency-key/**';
  await page.route(receiptPath,route=>route.fulfill({status:503,json:{error:'unavailable',detail:'Synthetic receipt lookup outage'}}));
  let executions=0;
  page.on('request',r=>{if(r.url().endsWith('/submit')&&r.method()==='POST')executions++;});
  await page.getByRole('button',{name:/Authorize & Submit/}).click();
  const retry=page.getByRole('button',{name:'Check Prior Submission & Retry Safely'});
  await expect(retry).toBeVisible();
  await expect(page.getByText('Simulated Complaint Submitted',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/SIM-CONF-/)).toHaveCount(0);
  await page.unroute(receiptPath);
  await retry.click();
  await expect(page.getByText('Simulated Complaint Submitted',{exact:true})).toBeVisible();
  expect(executions).toBe(1);
  await page.reload();
  await expect(page.getByText('Simulated Complaint Submitted',{exact:true})).toBeVisible();
  await expect(page.getByText('Confirmation unavailable',{exact:false})).toHaveCount(0);
});

test('Admin queue blocks withdrawn sharing and assignment errors stay recoverable',async({page,request})=>{
  const {id,root,headers}=await ready(request,true);
  const current=await (await request.get(root,{headers})).json();
  await login(page,'demo-admin');
  const queue=page.getByRole('region',{name:'Submitted case assignment queue'});
  const card=queue.getByRole('article',{name:'Submitted case '+id,exact:true});
  await expect(card).toContainText(current.submission_reference);
  await expect(queue).not.toContainText(current.incident_data.description);
  await page.setViewportSize({width:390,height:900});
  await expect(card).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
  expect((await card.getByRole('combobox').boundingBox())!.width).toBeGreaterThan(200);
  await page.screenshot({path:'test-results/admin-assignment-mobile.png',fullPage:true});
  const endpoint='**/api/v1/admin/complaints/'+id+'/assignment';
  await page.route(endpoint,route=>route.fulfill({status:503,json:{error:'unavailable',detail:'Synthetic assignment outage'}}));
  await card.getByRole('button',{name:'Assign officer',exact:true}).click();
  await expect(queue.getByText('Synthetic assignment outage',{exact:true})).toBeVisible();
  await expect(card.getByRole('button',{name:'Assign officer',exact:true})).toBeEnabled();
  await expect(queue.getByText(/assigned to demo-officer-financial/)).toHaveCount(0);
  await page.unroute(endpoint);
  const permissions=await (await request.get(root+'/consents',{headers})).json();
  const grant=permissions.find((row:{purpose:string})=>row.purpose==='complaint_submission');
  expect((await request.post(API+'/api/v1/consents/'+grant.consent_id+'/withdraw',{headers})).ok()).toBe(true);
  await queue.getByRole('button',{name:'Refresh submitted cases'}).click();
  await expect(card).toContainText('Withdrawn or limited');
  await expect(card.getByRole('button',{name:'Assign officer',exact:true})).toBeDisabled();
});

test('required sharing includes payment only with a reference and recovers partial grants',async({page,request})=>{
  const {id,root,headers}=await ready(request,false,'DEMO-'+crypto.randomUUID());
  const rows=await (await request.get(root+'/consents',{headers})).json();
  const identity=rows.find((row:{purpose:string})=>row.purpose==='mock_identity_check');
  expect((await request.post(API+'/api/v1/consents/'+identity.consent_id+'/withdraw',{headers})).ok()).toBe(true);
  await login(page);
  await page.goto('/citizen/complaints/'+id+'/wizard');
  const consent=page.getByRole('region',{name:'Data sharing consent'});
  const required=consent.locator('[aria-label="Required complaint sharing"]');
  await expect(required).toContainText('Simulated payment lookup');
  await expect(required).not.toContainText('Gemini');
  const sent:string[]=[];
  let fail=true;
  await page.route('**/api/v1/complaints/'+id+'/consents',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const recipient=route.request().postDataJSON().recipient;
    sent.push(recipient);
    if(fail && recipient==='service:mock-payment')return route.fulfill({status:503,json:{error:'unavailable',detail:'Synthetic failure'}});
    return route.continue();
  });
  await page.getByText(/I reviewed this complaint summary and explicitly authorize/).click();
  const submit=page.getByRole('button',{name:/Authorize & Submit/});
  await expect(submit).toBeDisabled();
  await required.getByRole('checkbox').check();
  await required.getByRole('button',{name:'Allow required sharing',exact:true}).click();
  await expect(consent.getByText(/Some permissions could not be saved/)).toBeVisible();
  await expect(submit).toBeDisabled();
  expect(sent.sort()).toEqual(['service:mock-identity','service:mock-payment']);
  sent.length=0;fail=false;
  await required.getByRole('button',{name:'Allow required sharing',exact:true}).click();
  await expect(required.getByText(/All required sharing permissions are ready/)).toBeVisible();
  await expect(submit).toBeEnabled();
  expect(sent).toEqual(['service:mock-payment']);
  const record=await (await request.get(root,{headers})).json();
  expect(record.current_status).toBe('CITIZEN_REVIEW');
  expect(record.authorization_id).toBeFalsy();
  const grants=await (await request.get(root+'/consents',{headers})).json();
  expect(grants.filter((row:{status:string})=>row.status==='granted').map((row:{recipient:string})=>row.recipient).sort()).toEqual(['service:mock-data','service:mock-identity','service:mock-payment','workspace:mock-financial-fraud']);
  await consent.getByText('Manage individual permissions and optional services',{exact:true}).click();
  await consent.getByRole('button',{name:'Withdraw Simulated payment lookup (when a reference is supplied)',exact:true}).click();
  await expect(submit).toBeDisabled();
});

test('a stale voice confirmation cannot overwrite a newer case edit',async({page,request})=>{
  const {id,root,headers}=await ready(request);
  const current=await (await request.get(root,{headers})).json();
  const grant=await request.post(root+'/consents',{headers,data:{recipient:'service:gemini-voice',purpose:'voice_processing',data_scopes:['voice_audio','voice_transcript']}});expect(grant.ok()).toBeTruthy();
  const recorded=await request.post(root+'/voice-inputs',{headers:{...headers,'If-Match':'"'+current.version+'"','Idempotency-Key':crypto.randomUUID()},multipart:{allow_external_processing:'true',file:{name:'voice.wav',mimeType:'audio/wav',buffer:wave()}}});expect(recorded.ok()).toBeTruthy();
  await login(page);
  await page.goto('/citizen/complaints/'+id+'/wizard');
  // Return from the ready review to the intake form without changing saved facts.
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Edit incident details',exact:true}).click();
  const panel=page.getByRole('region',{name:'Saved complaint voice input'});
  await expect(panel.getByLabel('Reviewed voice facts')).toBeVisible();
  const changed=await request.patch(root,{headers:{...headers,'If-Match':'"'+current.version+'"'},data:{description:'Newer citizen edit must survive'}});expect(changed.ok()).toBeTruthy();
  await panel.getByText('I reviewed these fields and want to apply these corrections.').click();
  const confirmation=page.waitForResponse(r=>r.url().endsWith('/confirm')&&r.request().method()==='POST');
  await panel.getByRole('button',{name:'Apply reviewed voice facts'}).click();
  expect((await confirmation).status()).toBe(412);
  expect((await (await request.get(root,{headers})).json()).incident_data.description).toBe('Newer citizen edit must survive');
});

test('narrow field grants satisfy sharing and another workspace never substitutes for the route',async({page,request})=>{
  const {id,root,headers}=await ready(request);
  const rows=await (await request.get(root+'/consents',{headers})).json();
  const workspace=rows.find((row:{purpose:string})=>row.purpose==='complaint_submission');
  const fields=['incident_type','incident_date','description','amount','currency','payment_method','transaction_reference','suspect_details'];
  expect((await request.patch(API+'/api/v1/consents/'+workspace.consent_id,{headers,data:{data_scopes:['case_status',...fields.map(field=>'incident_data.'+field)]}})).ok()).toBe(true);
  await login(page);
  await page.goto('/citizen/complaints/'+id+'/wizard');
  const required=page.locator('[aria-label="Required complaint sharing"]');
  await expect(required.getByText(/All required sharing permissions are ready/)).toBeVisible();
  await expect(required).not.toContainText('Simulated payment lookup');
  expect((await request.post(API+'/api/v1/consents/'+workspace.consent_id+'/withdraw',{headers})).ok()).toBe(true);
  expect((await request.post(root+'/consents',{headers,data:{recipient:'workspace:mock-digital-safety',purpose:'complaint_submission',data_scopes:['case_status','incident_data']}})).ok()).toBe(true);
  await page.reload();
  await expect(required).toContainText('Mock Financial Fraud Intake — Permission needed');
  await page.getByText(/I reviewed this complaint summary and explicitly authorize/).click();
  await expect(page.getByRole('button',{name:/Authorize & Submit/})).toBeDisabled();
  await required.getByRole('checkbox').check();
  const grant=page.waitForResponse(response=>response.url().endsWith('/consents')&&response.request().method()==='POST');
  await required.getByRole('button',{name:'Allow required sharing',exact:true}).click();
  const response=await grant;expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().recipient).toBe('workspace:mock-financial-fraud');
  await expect(required.getByText(/All required sharing permissions are ready/)).toBeVisible();
  await expect(page.getByRole('button',{name:/Authorize & Submit/})).toBeEnabled();
});

test('microphone denial keeps typed reporting available without any provider upload',async({page})=>{
  await login(page);
  await page.goto('/citizen/new');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  const calls:string[]=[];page.on('request',r=>{if(r.url().endsWith('/voice-inputs')&&r.method()==='POST')calls.push(r.url());});
  await page.getByRole('button',{name:'Start Urdu voice recording',exact:true}).click();
  await expect(page.getByText(/Microphone permission denied/)).toBeVisible();
  await page.locator('#incident-description').fill('Typed synthetic complaint after microphone denial.');
  expect(calls).toEqual([]);
});

test('actual browser MediaRecorder audio reaches the persisted voice API',async({page})=>{
  await login(page);
  await page.goto('/citizen/new');
  const panel=page.getByRole('region',{name:'Saved complaint voice input'});
  await panel.getByRole('button',{name:'Start Urdu voice recording',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Stop Urdu voice recording',exact:true})).toBeVisible();
  await page.waitForTimeout(1200); // Capture a real bounded WebM/Opus sample from Chromium's synthetic microphone.
  await panel.getByRole('button',{name:'Stop Urdu voice recording',exact:true}).click();
  await panel.getByText('I consent to send this recording and transcript to Gemini for this complaint. No filing is authorized.').click();
  const response=page.waitForResponse(r=>r.url().endsWith('/voice-inputs')&&r.request().method()==='POST');
  await panel.getByRole('button',{name:'Transcribe recording',exact:true}).click();
  const received=await response;expect(received.ok()).toBeTruthy();
  expect((await received.json()).status).toBe('READY');
});

test('unsaved review corrections block authorization until saved and analyzed',async({page,request})=>{
  const {id}=await ready(request);
  await login(page);
  await page.goto('/citizen/complaints/'+id+'/wizard');
  await page.locator('#review-desc').fill('Citizen explicitly corrected this synthetic description '+crypto.randomUUID());
  await page.getByText(/I reviewed this complaint summary and explicitly authorize/).click();
  await expect(page.getByRole('button',{name:/Authorize & Submit/})).toBeDisabled();
  await page.getByText('I permit Gemini to analyze my saved summary corrections.').click();
  const reassessed=page.waitForResponse(r=>r.url().endsWith('/analyze')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Save Summary Corrections',exact:true}).click();
  expect((await reassessed).ok()).toBeTruthy();
  await expect(page.getByRole('button',{name:/Authorize & Submit/})).toBeDisabled();
  await page.getByText(/I reviewed this complaint summary and explicitly authorize/).click();
  await expect(page.getByRole('button',{name:/Authorize & Submit/})).toBeEnabled();
});

test('browser routes and backend deny another role raw citizen access',async({page,request})=>{
  const auth=await token(request);
  const created=await request.post(API+'/api/v1/complaints',{headers:{Authorization:'Bearer '+auth},data:{description:'Synthetic owner isolation case'}});
  const id=(await created.json()).complaint_id;
  await login(page,'demo-helper');
  await page.goto('/helper/complaints/'+id);
  await expect(page.getByText('Access Denied (403 Forbidden)',{exact:true})).toBeVisible();
  await page.goto('/citizen/new');
  await expect(page.getByText('Role Access Restricted (403)',{exact:true})).toBeVisible();
});

test('citizen grants Helper access; revocation blocks the next Helper read',async({page,request})=>{
  const auth=await token(request);
  const created=await request.post(API+'/api/v1/complaints',{headers:{Authorization:'Bearer '+auth},data:{description:'Synthetic helper assistance '+crypto.randomUUID()}});
  const id=(await created.json()).complaint_id;
  await login(page);
  await page.goto('/citizen/complaints/'+id);
  const consent=page.getByRole('region',{name:'Data sharing consent'});
  await consent.getByText('Manage individual permissions and optional services',{exact:true}).click();
  await consent.getByLabel('Consent recipient').selectOption('user:demo-helper');
  await consent.getByRole('button',{name:'Grant helper access and selected consent'}).click();
  await expect(consent.getByRole('button',{name:'Withdraw Demo community helper',exact:true})).toBeVisible();
  await page.evaluate(()=>sessionStorage.clear());
  await login(page,'demo-helper');
  await page.goto('/helper/complaints/'+id);
  await expect(page.getByText(/Synthetic helper assistance/).first()).toBeVisible();
  await page.evaluate(()=>sessionStorage.clear());
  await login(page);
  await page.goto('/citizen/complaints/'+id);
  await page.getByText('Manage individual permissions and optional services',{exact:true}).click();
  await page.getByRole('button',{name:'Withdraw Demo community helper',exact:true}).click();
  await page.evaluate(()=>sessionStorage.clear());
  await login(page,'demo-helper');
  await page.goto('/helper/complaints/'+id);
  await expect(page.getByText('Access Denied (403 Forbidden)',{exact:true})).toBeVisible();
  await expect(page.getByText(/Synthetic helper assistance/)).toHaveCount(0);
});

test('Admin can issue a scoped self key and revoke it through the live API',async({page})=>{
  await login(page,'demo-admin');
  await page.goto('/admin?tab=keys');
  await page.getByRole('button',{name:'Issue API Key',exact:true}).click();
  const issued=page.waitForResponse(r=>r.url().endsWith('/admin/api-keys')&&r.request().method()==='POST');
  await page.getByRole('dialog').getByRole('button',{name:'Issue Key',exact:true}).click();
  const response=await issued;expect(response.ok()).toBeTruthy();
  const key=await response.json();expect(key.scopes).toEqual(['admin:rules']);
  expect(key.api_key.length).toBeGreaterThan(32);
  const row=page.getByRole('row').filter({hasText:key.api_key_id});
  const revoked=page.waitForResponse(r=>r.url().endsWith('/revoke')&&r.request().method()==='POST');
  await row.getByRole('button',{name:'Revoke',exact:true}).click();
  expect((await (await revoked).json()).revoked).toBe(true);
});

test('local edits survive refresh and reconnect without claiming a server save',async({page})=>{
  await login(page);
  await page.goto('/citizen/new');
  await expect(page.locator('#incident-description')).toBeVisible();
  await page.context().setOffline(true);
  await page.locator('#incident-description').fill('Synthetic offline local draft');
  await page.context().setOffline(false);
  await page.goto('/citizen/new?recover=1');
  await expect(page.locator('#incident-description')).toHaveValue('Synthetic offline local draft');
  await expect(page.getByText('Recovered your saved local draft.',{exact:true})).toBeVisible();
});

test('Admin edits append an immutable routing version through the current contract',async({page,request})=>{
  const admin=await token(request,'demo-admin');
  const headers={Authorization:'Bearer '+admin};
  const rules=await (await request.get(API+'/api/v1/admin/routing-rules',{headers})).json();
  const original=rules[0];
  await login(page,'demo-admin');
  await page.goto('/admin?tab=rules');
  await page.getByRole('button',{name:'Edit Rule',exact:true}).first().click();
  await page.locator('#edit-justification').fill('Synthetic browser verification of an immutable edit '+crypto.randomUUID());
  const updated=page.waitForResponse(r=>r.url().includes('/routing-rules/')&&r.request().method()==='PATCH');
  await page.getByRole('dialog').getByRole('button',{name:'Publish New Rule Version',exact:true}).click();
  const response=await updated;expect(response.ok()).toBeTruthy();
  const current=await response.json();
  expect(current.rule_version_id).not.toBe(original.rule_version_id);
  const history=await (await request.get(API+'/api/v1/admin/routing-rules/'+current.rule_id+'/versions',{headers})).json();
  expect(history.some((v:{rule_version_id:string})=>v.rule_version_id===original.rule_version_id)).toBe(true);
  await expect(page.getByText('Immutable Rule Version History',{exact:true})).toBeVisible();
  const table=page.getByRole('table',{name:'Rule version history'});
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await table.scrollIntoViewIfNeeded();
    const overlap=await table.locator('tbody td').evaluateAll(cells=>cells.some(cell=>{
      const range=document.createRange();range.selectNodeContents(cell);
      const text=range.getBoundingClientRect(), box=cell.getBoundingClientRect();
      return text.left < box.left-1 || text.right > box.right+1 || text.bottom > box.bottom+1;
    }));
    expect(overlap).toBe(false);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true);
    await page.screenshot({path:'test-results/rule-history-'+width+'.png',fullPage:true});
  }
  await page.locator('[role="radio"][lang="ur"]').filter({visible:true}).first().click();
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true);
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/rule-history-urdu.png',fullPage:true});
});

test('evidence uploads and authenticated previews preserve the original bytes',async({page,request})=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGNkaGBgYGBgAhEMDAAGKgCE2O/yUgAAAABJRU5ErkJggg==','base64');
  await login(page);
  await page.goto('/citizen/new');
  await page.locator('#incident-description').fill('Synthetic evidence upload '+crypto.randomUUID());
  const uploaded=page.waitForResponse(r=>r.url().endsWith('/evidence')&&r.request().method()==='POST');
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({name:'synthetic-proof.png',mimeType:'image/png',buffer:png});
  const upload=await uploaded;expect(upload.ok()).toBeTruthy();
  const file=await upload.json();
  await page.goto('/citizen/complaints/'+file.complaint_id);
  const gallery=page.getByRole('region',{name:'Private evidence',exact:true});
  const download=page.waitForResponse(r=>r.url().endsWith('/content')&&r.request().method()==='GET');
  await gallery.getByRole('button',{name:'Open synthetic-proof.png',exact:true}).click();
  const bytes=await download;expect(bytes.ok()).toBeTruthy();expect((await bytes.body()).equals(png)).toBe(true);
  await expect(gallery.getByRole('img',{name:'synthetic-proof.png'})).toHaveAttribute('src',/^blob:/);
  const admin=await token(request,'demo-admin');
  const denied=await request.get(API+'/api/v1/complaints/'+file.complaint_id+'/evidence/'+file.evidence_id+'/content',{headers:{Authorization:'Bearer '+admin}});
  expect(denied.status()).toBe(403);
});

test('an expired login returns to sign-in and preserves the local draft',async({page})=>{
  await login(page);
  await page.goto('/citizen/new');
  await page.locator('#incident-description').fill('Synthetic local draft before session expiry');
  await page.getByText('I permit this saved complaint to be sent to Gemini for analysis. This does not authorize filing.').click();
  const now=Math.floor(Date.now()/1000);
  const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body=Buffer.from(JSON.stringify({sub:'demo-citizen-1',iss:'dastak',aud:'dastak-api',iat:now-4000,nbf:now-4000,exp:now-1})).toString('base64url');
  // This key belongs only to the disposable browser server, never the application.
  const signature=createHmac('sha256','browser-test-only-secret-with-at-least-32-characters').update(head+'.'+body).digest('base64url');
  await page.evaluate(value=>sessionStorage.setItem('dastak_access_token',value),head+'.'+body+'.'+signature);
  await page.getByRole('button',{name:'Save & Analyze with AI',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await page.goto('/citizen/new?recover=1');
  await expect(page.locator('#incident-description')).toHaveValue('Synthetic local draft before session expiry');
});

test('lost voice acknowledgement recovers the saved proposal without another upload',async({page})=>{
  await login(page);
  await page.goto('/citizen/new');
  const panel=page.getByRole('region',{name:'Saved complaint voice input'});
  await panel.getByLabel('Upload Urdu recording').setInputFiles({name:'voice.wav',mimeType:'audio/wav',buffer:wave()});
  await panel.getByText('I consent to send this recording and transcript to Gemini for this complaint. No filing is authorized.').click();
  let uploads=0;
  await page.route('**/api/v1/complaints/*/voice-inputs',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    uploads++;
    const received=await route.fetch();expect(received.ok()).toBeTruthy();
    await route.fulfill({status:503,json:{error:'unavailable',detail:'Synthetic lost voice response'}});
  });
  await panel.getByRole('button',{name:'Transcribe recording',exact:true}).click();
  await expect(panel.getByText('Synthetic lost voice response',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Recover saved voice progress',exact:true}).click();
  await expect(panel.getByLabel('Reviewed voice facts')).toBeVisible();
  expect(uploads).toBe(1);
});
