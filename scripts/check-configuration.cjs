// Read-only runner diagnostics. Outputs flags and error categories, never credential values.
const {google}=require('googleapis');
const nodemailer=require('nodemailer');
const fs=require('node:fs/promises');
const present=name=>Boolean(process.env[name]);
async function verifyEmail(user,password){
 if(!user||!password)return {authenticated:false,reason:'Missing email credentials'};
 const transport=nodemailer.createTransport({service:'gmail',auth:{user,pass:password},connectionTimeout:15000,socketTimeout:20000});
 try{await transport.verify();return {authenticated:true};}
 catch(error){return {authenticated:false,reason:error.code==='EAUTH'?'SMTP authentication rejected':'SMTP connection/transport failure',responseCode:error.responseCode??null};}
 finally{transport.close();}
}
async function main(){
 const report={};
 const names=['GOOGLE_CREDENTIALS','GOOGLE_SHEET_ID','GEMINI_API_KEY','GEMINI_API_KEY_FOR_VISUALS','ASSEMBLYAI_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN','INSTAGRAM_ACCOUNT_ID','INSTAGRAM_ACCESS_TOKEN','FACEBOOK_PAGE_ID','FACEBOOK_ACCESS_TOKEN','EMAIL_USER','EMAIL_APP_PASSWORD','NOTIFICATION_EMAIL'];
 report.missingEnvironment=names.filter(name=>!present(name));
 const user=process.env.EMAIL_USER??'', password=process.env.EMAIL_APP_PASSWORD??'';
 report.emailFormatting={userHasOuterWhitespace:user!==user.trim(),passwordHasWhitespace:/\s/.test(password),passwordHasOuterQuotes:/^["']|["']$/.test(password),looksLikeAppPassword:/^[a-z]{16}$/i.test(password.replace(/\s/g,'')),notificationRecipientConfigured:present('NOTIFICATION_EMAIL')};
 report.email=await verifyEmail(user,password);
 const normalizedUser=user.trim(),normalizedPassword=password.replace(/\s/g,'');
 if(!report.email.authenticated&&(normalizedUser!==user||normalizedPassword!==password))report.emailWithWhitespaceRemoved=await verifyEmail(normalizedUser,normalizedPassword);
 let alternate;try{alternate=JSON.parse(process.env.OAUTH_ACCESS_TOKEN??'');}catch{}
 report.alternateOAuth={configured:present('OAUTH_ACCESS_TOKEN'),jsonContainsRefreshToken:Boolean(alternate&&typeof alternate.refresh_token==='string'&&alternate.refresh_token)};
 let credentials;
 try{credentials=JSON.parse(process.env.GOOGLE_CREDENTIALS??'');}catch{}
 report.googleCredentialShape={serviceAccount:Boolean(credentials?.client_email&&credentials?.private_key),containsOAuthRefreshToken:Boolean(credentials?.refresh_token)};
 if(report.googleCredentialShape.serviceAccount&&present('GOOGLE_SHEET_ID')){
  try{
   const auth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
   const sheets=google.sheets({version:'v4',auth});
   const tab=process.env.SHEET_TAB||'Sheet1';
   const result=await sheets.spreadsheets.values.batchGet({spreadsheetId:process.env.GOOGLE_SHEET_ID,ranges:[`'${tab.replace(/'/g,"''")}'!A1:AZ7`,'AutomationControl!A1:B2']});
   const rows=result.data.valueRanges?.[0]?.values??[],control=result.data.valueRanges?.[1]?.values??[];
   const headers=(rows[0]??[]).map(value=>String(value).trim().toLowerCase()),row=rows[5]??[];
   const cell=aliases=>{const index=headers.findIndex(header=>aliases.includes(header));return index<0?'':String(row[index]??'');};
   let progress;try{progress=JSON.parse(cell(['progress json']));}catch{}
   report.sheet={readable:true,row6:{status:cell(['status']),hasTaskId:Boolean(cell(['task id','taskid'])),hasJobId:Boolean(cell(['job id'])),progressJsonReadable:Boolean(progress&&typeof progress==='object'),savedLastCompleted:typeof progress?.lastCompleted==='string'?progress.lastCompleted:null,links:{youtube:Boolean(cell(['yt link','youtube link','links'])),instagram:Boolean(cell(['insta link','instagram link'])),facebook:Boolean(cell(['fb link','facebook link']))}},paused:String(control[0]?.[1]??'').toUpperCase()};
  }catch(error){report.sheet={readable:false,errorCode:error.code??null};}
 }
 // Authentication/read checks only; never generate content, create uploads or publish.
 async function read(url,headers){
  try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});const value=await response.json().catch(()=>({}));return {status:response.status,ok:response.ok,value};}
  catch(error){return {status:null,ok:false,value:{},errorCode:typeof error.cause?.code==='string'&&/^[A-Z_]+$/.test(error.cause.code)?error.cause.code:error.name};}
 }
 try{
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID??'',client_secret:process.env.GOOGLE_CLIENT_SECRET??'',refresh_token:process.env.YOUTUBE_REFRESH_TOKEN??'',grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
  const token=await response.json();
  report.youtube={refreshAccepted:response.ok,error:response.ok?null:['invalid_grant','invalid_client','unauthorized_client','invalid_request'].includes(token.error)?token.error:'OAuth request failed'};
  if(response.ok&&token.access_token){const channel=await read('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{Authorization:'Bearer '+token.access_token});report.youtube.channelReadStatus=channel.status;report.youtube.channelAvailable=Boolean(channel.value.items?.length);report.youtube.scopes=typeof token.scope==='string'?token.scope.split(' '):[];}
 }catch{report.youtube={refreshAccepted:false,error:'OAuth connection failure'};}
 const scriptModel=process.env.GEMINI_SCRIPT_MODEL||'gemini-2.5-flash',visualModel=process.env.GEMINI_VISUAL_MODEL||'gemini-2.5-pro';
 const scriptModelRead=await read('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(scriptModel),{'x-goog-api-key':process.env.GEMINI_API_KEY??''});
 const visualModelRead=await read('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(visualModel),{'x-goog-api-key':process.env.GEMINI_API_KEY_FOR_VISUALS??''});
 const assembly=await read('https://api.assemblyai.com/v2/transcript?limit=1',{authorization:process.env.ASSEMBLYAI_API_KEY??''});
 const storage=await read((process.env.SUPABASE_URL??'').replace(/\/$/,'')+'/storage/v1/bucket/'+encodeURIComponent(process.env.SUPABASE_BUCKET||'videos'),{Authorization:'Bearer '+(process.env.SUPABASE_SERVICE_ROLE_KEY??''),apikey:process.env.SUPABASE_SERVICE_ROLE_KEY??''});
 const graph='https://graph.facebook.com/'+(process.env.GRAPH_API_VERSION||'v23.0');
 const instagram=await read(graph+'/'+encodeURIComponent(process.env.INSTAGRAM_ACCOUNT_ID??'')+'?fields=id',{Authorization:'Bearer '+(process.env.INSTAGRAM_ACCESS_TOKEN??'')});
 const facebook=await read(graph+'/'+encodeURIComponent(process.env.FACEBOOK_PAGE_ID??'')+'?fields=id,access_token',{Authorization:'Bearer '+(process.env.FACEBOOK_ACCESS_TOKEN??'')});
 let storageUrl;try{storageUrl=new URL(process.env.SUPABASE_URL??'');}catch{}
 report.supabaseConfiguration={urlValid:Boolean(storageUrl),usesHttps:storageUrl?.protocol==='https:',hasOuterWhitespace:(process.env.SUPABASE_URL??'')!==(process.env.SUPABASE_URL??'').trim(),hasOuterQuotes:/^["']|["']$/.test(process.env.SUPABASE_URL??''),hasUnexpectedPath:Boolean(storageUrl&&storageUrl.pathname!=='/'),usesStandardSupabaseHost:Boolean(storageUrl?.hostname.endsWith('.supabase.co')),connectionError:storage.errorCode??null};
 report.providerReadChecks={geminiNarration:{model:scriptModel,status:scriptModelRead.status},geminiVisuals:{model:visualModel,status:visualModelRead.status},assemblyai:{status:assembly.status},supabase:{status:storage.status,bucketPublic:storage.value.public===true},instagram:{status:instagram.status},facebook:{status:facebook.status,pageTokenAvailable:Boolean(facebook.value.access_token)}};
 const output=JSON.stringify(report,null,2);console.log(output);
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## Read-only configuration diagnostics\n\n```json\n'+output+'\n```\n');
}
main().catch(()=>{console.error('Configuration diagnostics failed unexpectedly; no secret values logged.');process.exitCode=1;});
