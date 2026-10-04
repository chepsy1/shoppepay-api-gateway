import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-signature,x-timestamp,x-partner-id,x-external-id,channel-id","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
function pemToDer(pem:string){const b64=pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"");const bin=atob(b64);return Uint8Array.from(bin,c=>c.charCodeAt(0)).buffer;}
async function sha256Hex(text:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function verify(body:string,path:string,signature:string,timestamp:string,pem:string){
  const key=await crypto.subtle.importKey("spki",pemToDer(pem),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const hash=await sha256Hex(body);
  const input=`POST:${path}:${hash}:${timestamp}`;
  const raw=Uint8Array.from(atob(signature),c=>c.charCodeAt(0));
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,raw,new TextEncoder().encode(input));
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({message:"Method not allowed"},405);
  try{
    const body=await req.text();
    const signature=req.headers.get("X-SIGNATURE")||"";
    const ts=req.headers.get("X-TIMESTAMP")||"";
    const publicKey=Deno.env.get("DANA_PUBLIC_KEY")||"";
    if(!signature||!ts||!publicKey) return json({message:"Webhook credentials belum lengkap."},400);
    if(!(await verify(body,"/v1.0/debit/notify",signature,ts,publicKey))) return json({message:"Invalid signature"},401);
    const payload=JSON.parse(body);
    const partnerRef=payload.originalPartnerReferenceNo;
    if(!partnerRef) return json({responseCode:"4005600",responseMessage:"Missing reference"},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:payment}=await db.from("payments").select("id,status,amount").eq("partner_reference_no",partnerRef).maybeSingle();
    if(!payment) return json({responseCode:"4045600",responseMessage:"Transaction not found"},404);

    const notifiedAmount=Number(payload.amount?.value||0);
    if(notifiedAmount && Math.round(notifiedAmount)!==Math.round(Number(payment.amount))) return json({responseCode:"4005600",responseMessage:"Amount mismatch"},400);

    const next=payload.latestTransactionStatus==="00"?"PAID":payload.latestTransactionStatus==="05"?"EXPIRED":payment.status;
    const update:any={status:next,dana_payload:payload,updated_at:new Date().toISOString()};
    if(next==="PAID") update.paid_at=payload.paidTime||payload.finishedTime||new Date().toISOString();
    await db.from("payments").update(update).eq("id",payment.id);
    return json({responseCode:"2005600",responseMessage:"Successful"});
  }catch(e){return json({message:e?.message||"Internal error"},500);}
});