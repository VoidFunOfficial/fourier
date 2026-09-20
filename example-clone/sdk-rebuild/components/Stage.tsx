import { FourierMotion, loadFont, useFourierContext, type ReactNode } from '@fourier-video/sdk';
import sf from '../assets/fonts/SF-Pro.woff';
import montserrat from '../assets/fonts/Montserrat-Medium.woff';
import grain from '../assets/texture/grain.png';

export const SF = loadFont(sf, { weight: 400 });
export const MONTSERRAT = loadFont(montserrat, { weight: 500 });
export const C = { paper: '#dfdde0', ink: '#272526', blue: '#506ee2', navy: '#3d5680', mint: '#56b2a0', coral: '#fb647c', peach: '#ff8b83' };
export const EASE = 'cubic-bezier(.22,.85,.24,1)';
export const FULL = { position: 'absolute' as const, inset: 0 };

export function Stage({ children, dark=false }: { children: ReactNode; dark?: boolean }) {
  const { width, height } = useFourierContext();
  return <FourierMotion><div style={{position:'relative',width,height,overflow:'hidden',background:dark?C.ink:C.paper,fontFamily:SF,fontWeight:400,color:dark?C.paper:C.ink}}>
    <style>{'*{box-sizing:border-box}svg{overflow:visible}'}</style>
    <div style={{position:'absolute',width:1280,height:720,transform:`scale(${width/1280},${height/720})`,transformOrigin:'0 0'}}>
      {children}
      <div aria-hidden="true" style={{...FULL,pointerEvents:'none',backgroundImage:`url(${grain})`,backgroundSize:'128px 128px',opacity:dark?.068:.052,mixBlendMode:'soft-light'}}/>
    </div>
  </div></FourierMotion>;
}
