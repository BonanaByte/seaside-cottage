/* Material-local colour tuning, in perceptual sRGB. No screen filter or light changes. */
function coastalSurfaceColor(T,hex,type) {
  const color=new T.Color(hex),srgb=color.clone().convertLinearToSRGB(),hsl={};
  srgb.getHSL(hsl);
  // Keep dark anchors (piano, ironwork, telescope) and near-neutral whites intact.
  if(hsl.l<.32 || hsl.s<.055) return color;
  if(type==='foliage' && (hsl.h<.17 || hsl.h>.45)) return color;
  const saturation={wood:.80,oiledWood:.80,fabric:.82,cotton:.82,ceramic:.88,satin:.88,foliage:.76}[type];
  if(saturation===undefined) return color;
  srgb.setHSL(hsl.h,hsl.s*saturation,Math.min(1,hsl.l+(type==='wood'?.008:0)));
  return srgb.convertSRGBToLinear();
}
