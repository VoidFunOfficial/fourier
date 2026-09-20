// Exact Apple website assets. Full source URLs and SHA-256s: assets/official/sources.json.
import productivityDesk from '../assets/official/performance_productivity_1__d40pebfrlqmq_large_2x.jpg';
import productivityScreen from '../assets/official/performance_productivity_2__do0p70ktiuuu_large_2x.jpg';
import creativityDesk from '../assets/official/performance_creativity_1__fqwakkhqpm2q_large_2x.jpg';
import creativityScreen from '../assets/official/performance_creativity_2__dza6766qhqye_large_2x.jpg';
import stemDesk from '../assets/official/performance_stem_1__bmu2eay841xy_large_2x.jpg';
import stemScreen from '../assets/official/performance_stem_2__bjc3rh4n7dw2_large_2x.jpg';
import gamingDesk from '../assets/official/performance_gaming_1__4f5hs0u1cgie_large_2x.jpg';
import gamingScreen from '../assets/official/performance_gaming_2__cyr5zva871aq_large_2x.jpg';
import codingDesk from '../assets/official/performance_coding_1__dm83k6b69is2_large_2x.jpg';
import codingScreen from '../assets/official/performance_coding_2__b8ybr062yjo2_large_2x.jpg';
import screenLeft from '../assets/official/performance_screen_left__c5fg5tgdnhiu_large_2x.jpg';
import screenMiddle from '../assets/official/performance_screen_middle__faxq2r83s7u6_large_2x.jpg';
import screenRight from '../assets/official/performance_screen_right__e2ef7479cbee_large_2x.jpg';
import display from '../assets/official/performance_hw_display__bo6ks7s2l9si_large_2x.png';
import mirroring from '../assets/official/mac_iphone_mirroring__f420q7238wuy_large_2x.jpg';
import thermal from '../assets/official/performance_thermal__f28l49zfao2m_large_2x.jpg';
import agentic from '../assets/official/ai_agentic__bdref58mxbma_large_2x.jpg';
export const DESKTOPS = [
 { name: 'Productivity', desk: productivityDesk, screen: productivityScreen },
 { name: 'Creativity', desk: creativityDesk, screen: creativityScreen },
 { name: 'STEM', desk: stemDesk, screen: stemScreen },
 { name: 'Gaming', desk: gamingDesk, screen: gamingScreen },
 { name: 'Coding', desk: codingDesk, screen: codingScreen },
] as const;
export const SCREENS = [screenLeft, screenMiddle, screenRight] as const;
export const OFFICIAL = { display, mirroring, thermal, agentic };
