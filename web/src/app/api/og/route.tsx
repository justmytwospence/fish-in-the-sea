import { ImageResponse } from 'next/og';
export async function GET() {
  return new ImageResponse(<div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',padding:64,background:'#f5f0e6',color:'#1d1a16',fontFamily:'sans-serif'}}>
    <div style={{fontSize:28}}>FISH IN THE SEA</div>
    <div style={{fontSize:72,marginTop:60}}>Explore your dating market.</div>
    <div style={{fontSize:32,marginTop:50}}>Population estimates and qualified competition comparisons—not dating predictions.</div>
  </div>,{width:1200,height:630,headers:{'Cache-Control':'public, max-age=86400'}});
}
