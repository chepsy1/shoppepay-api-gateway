import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({message:"Method not allowed"},405);
  try{
    const {paymentId}=await req.json();
    if(!paymentId) return json({message:"paymentId wajib."},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data,error}=await db.from("payments").select("id,partner_reference_no,amount,status,expires_at,paid_at,created_at").eq("id",paymentId).maybeSingle();
    if(error||!data) return json({message:"Transaksi tidak ditemukan."},404);
    if(data.status==="PENDING" && new Date(data.expires_at).getTime()<=Date.now()){
      await db.from("payments").update({status:"EXPIRED",updated_at:new Date().toISOString()}).eq("id",paymentId).eq("status","PENDING");
      data.status="EXPIRED";
    }
    if(data.status==="PENDING") {
      const gatewayUrl=(Deno.env.get("PAYMENT_GATEWAY_URL")||"").replace(/\/$/,"");
      const gatewayKey=Deno.env.get("PAYMENT_GATEWAY_API_KEY")||"";
      if(!gatewayUrl||!gatewayKey) return json({message:"Payment gateway belum dikonfigurasi."},500);
      const startTime=Math.floor(new Date(data.created_at).getTime()/1000);
      const response=await fetch(`${gatewayUrl}/check-payment`,{
        method:"POST",
        headers:{"Content-Type":"application/json","X-API-Key":gatewayKey},
        body:JSON.stringify({amount:Number(data.amount),startTime})
      });
      const gateway=await response.json().catch(()=>({}));
      if(response.ok && gateway?.success && gateway?.paid){
        const paidAt=gateway?.transaction?.time ? new Date(gateway.transaction.time.replace(" ","T")+"+07:00").toISOString() : new Date().toISOString();
        await db.from("payments").update({status:"PAID",paid_at:paidAt,dana_reference_no:gateway?.transaction?.transactionId||null,dana_payload:gateway,updated_at:new Date().toISOString()}).eq("id",paymentId).eq("status","PENDING");
        data.status="PAID";
        data.paid_at=paidAt;
      }
    }
    return json({paymentId:data.id,partnerReferenceNo:data.partner_reference_no,amount:data.amount,status:data.status,expiresAt:data.expires_at,paidAt:data.paid_at});
  }catch(e){return json({message:e?.message||"Internal error"},500);}
});