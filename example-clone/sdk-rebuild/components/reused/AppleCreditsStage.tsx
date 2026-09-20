// Reused from ad-apple/components/Stage.tsx for the original credits layout.
import { loadFont, FourierMotion, useFourierContext, type ReactNode } from '@fourier-video/sdk';
import sf from '../../assets/fonts/Apple-Credits-SF-Pro.woff';
import heiti from '../../assets/fonts/Apple-Credits-Heiti.woff';
import { C } from './apple-credits-design.ts';
const SF=loadFont(sf,{weight:500});
const HEITI=loadFont(heiti,{weight:500});
export function Stage({ children, dark = false }: {
    children: ReactNode;
    dark?: boolean;
}) {
    const { width, height } = useFourierContext();
    return <FourierMotion><div style={{ position: 'relative', width, height, overflow: 'hidden', background: dark ? C.ink : C.paper, color: dark ? C.paper : C.ink, fontFamily: `${SF}, ${HEITI}, sans-serif`, fontWeight: 500 }}>
    <style>{`@font-face{font-family:FilmSF;src:url('${sf}');font-weight:100 900;font-display:block}@font-face{font-family:FilmHeiti;src:url('${heiti}');font-weight:100 900;font-display:block}*{box-sizing:border-box}`}</style>
    <div style={{ position: 'absolute', width: 1920, height: 1080, transform: `scale(${width / 1920},${height / 1080})`, transformOrigin: '0 0' }}>{children}</div>
  </div></FourierMotion>;
}
