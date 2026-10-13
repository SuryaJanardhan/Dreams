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
 const output=JSON.stringify(report,null,2);console.log(output);
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## Read-only configuration diagnostics\n\n```json\n'+output+'\n```\n');
}
main().catch(()=>{console.error('Configuration diagnostics failed unexpectedly; no secret values logged.');process.exitCode=1;});
