from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root=Path(__file__).resolve().parent.parent
text=''.join(p.read_text() for p in root.rglob('*.tsx'))+'\uf8ff0123456789×英寸核超级核心性能能效硬件加速光线追踪双神经网络引擎最高统一内存配置带宽编码解码前置后置耳机接口气流从底部穿行外接显示器镜像需兼容设备及软件功能因地区而异手绘建模视频剪辑本地多屏工作流支持最高达可选USBThunderboltHDMIWiFiBluetoothProResM6MacminiGPUCPUNeuralEngineGB/s24GB32GB5.03.5162.5Gb'
for src,index,out in [('/System/Library/Fonts/SFNS.ttf',None,'SF-Pro-subset.woff'),(str(root.parent/'fourier-ad/fonts/STHeiti.ttc'),1,'Heiti-subset.woff')]:
 font=TTFont(src,fontNumber=index) if index is not None else TTFont(src)
 # Use the installed font's default outlines; Apple symbol glyphs have no gvar data.
 for table in ['fvar','gvar','avar','HVAR','MVAR','VVAR','STAT']:
  if table in font: del font[table]
 options=subset.Options();options.flavor='woff';options.notdef_glyph=True
 sub=subset.Subsetter(options=options);sub.populate(text=text);sub.subset(font)
 font.flavor='woff';font.save(root/'assets/fonts'/out)
 print(out,(root/'assets/fonts'/out).stat().st_size)
