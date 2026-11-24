/* Furniture on the two arms of the upstairs L. Left-wall local +Z faces the room. */
function furnishUpstairs({T,house,left,back,skin,walkingHeight,opening,group,mesh,box,beveledBox,cushion,seatPad,backPad,bentBack,
  cylinder,beam,groundedLeg,ellipsoid,houseplant,paintedTexture,weave,finish,contact,footprint,framedPrint,printAtlas,paneGlass,layThrow,clothboundBook,turned,soft,lightLinenShade}) {
  const room=group("二楼卧室与书房",0,walkingHeight,0,house);
  const side=group("二楼左墙家具",left+skin,0,0,room);
  side.rotation.y=Math.PI/2;
  const ash=finish("wood",0xd9b890), edge=finish("wood",0xaf8460);
  const ivory=0xf0e3cd, sage=finish("fabric",0x809f98), brass=finish("brushed",0xd5ae71);
  const bedding=finish("cotton",0xf7efde);
  function fixture(parent,x,y,z,wallMounted) {
    const root=group(wallMounted?"二楼阅读壁灯":"床头台灯",x,y,z,parent);
    if(wallMounted) {
      box(root,0,.16,-.13,.09,.18,.035,brass);
      beam(root,[0,.20,-.13],[0,.20,.018],.016,brass);
      cylinder(root,0,.13,.018,.016,.016,.14,brass);
    } else {
      footprint(root,0,0,0,.33,.33);
      cylinder(root,0,.03,0,.115,.14,.06,brass);
      ellipsoid(root,0,.15,0,.09,.12,.09,finish("ceramic",0xad8066));
      cylinder(root,0,.27,0,.023,.027,.13,brass);
    }
    const shade=wallMounted?cylinder(root,0,0,.018,.093,.112,.19,finish("ceramic",ivory)):
      cylinder(root,0,.365,0,.115,.20,.225,finish("fabric",ivory),32);
    if(wallMounted) {
      shade.material=shade.material.clone();
      shade.material.emissive.setHex(0xffc69b);
      shade.material.emissiveIntensity=.52;
    } else {
      lightLinenShade(shade);
      shade.material.emissiveIntensity=1.28;
    }
    const light=new T.PointLight(0xffd5af,wallMounted?.94:1.38,wallMounted?2.0:1.85,1.85);
    light.name=wallMounted?"阅读壁灯暖光":"床头近场暖光";
    light.position.copy(shade.position); light.position.y-=.04;light.position.z+=.035;root.add(light);
    return {root,emitters:[{light,shade}],intensity:light.intensity,emission:shade.material.emissiveIntensity};
  }
  const stand=group("床头柜",-1.65,0,.39,side);
  contact(stand,.69,.70);
  const standOcclusion=contact(side,.84,.94);
  standOcclusion.rotation.x=0;
  standOcclusion.position.set(stand.position.x,.26,.009);
  for(const x of [-.19,.19]) for(const z of [-.18,.18]) {
    footprint(stand,x,0,z,.095,.095);
    cylinder(stand,x,.034,z,.027,.020,.068,edge,12);
  }
  beveledBox(stand,0,.30,0,.50,.48,.49,ash);
  beveledBox(stand,0,.565,0,.55,.065,.54,edge);
  for(const y of [.227,.423]) {
    beveledBox(stand,0,y,.253,.453,.182,.031,finish("wood",0xd5b28d));
    cushion(stand,0,y+.024,.279,.112,.016,.019,brass,.007);
  }
  const bedside=fixture(stand,0,.60,0,false);
  clothboundBook(stand,-.121,.598,.165,.226,.146,.034,0x719694,-.08);
  clothboundBook(stand,-.133,.632,.174,.194,.125,.027,0xcda17e,.035);
  soft.budVase(stand,.185,.598,.134,.71,0x779891,true);

  const bed=group("双人床",-.46,0,1.13,side);
  contact(bed,2.03,2.38);
  for(const x of [-.71,.71]) for(const z of [-.86,.86]) {
    box(bed,x,.12,z,.10,.24,.10,edge);
    footprint(bed,x,0,z,.19,.19);
  }
  cushion(bed,0,.242,0,1.76,.161,2.04,ash,.036);
  cushion(bed,0,.322,0,1.68,.052,1.97,edge,.021);
  const headboard=bentBack(bed,0,.707,-.967,1.77,.72,.115,.048,edge);
  headboard.rotation.x=-.055;
  for(const x of [-.385,.385]) {
    backPad(bed,x,.765,-.879,.778,.51,.107,finish("fabric",0xd8c5a5),-.07);
  }
  cushion(bed,0,.476,0,1.69,.268,1.99,bedding,.079);
  cushion(bed,0,.539,0,1.695,.022,1.995,finish("fabric",0xdfd3bd),.010);
  // Drape the cover over both sides of the mattress; quilt channels soften toward the hem.
  const cover=new T.PlaneGeometry(1,1,72,40);
  const quiltPos=cover.attributes.position, quiltUV=cover.attributes.uv;
  for(let i=0;i<quiltPos.count;i++) {
    const u=quiltUV.getX(i), v=quiltUV.getY(i), across=2*u-1;
    const sideDrop=Math.max(0,(Math.abs(across)-.88)/.12);
    const footDrop=Math.max(0,(v-.92)/.08);
    const quilting=.013*Math.sin((u+.024*Math.sin(v*7))*Math.PI*7)**2;
    const loft=quilting+.030*Math.cos(v*11+u*5)*Math.sin(Math.PI*u)
      +.014*Math.cos(24*u+7*v)*(v*v+sideDrop);
    const height=.637+loft-Math.max(.18*sideDrop**1.5,.13*footDrop**1.5);
    quiltPos.setXYZ(i,.99*across-.09*Math.sign(across)*sideDrop,height,-.41+1.50*v-.028*footDrop);
  }
  cover.computeVertexNormals();
  const quiltMat=bedding.clone();quiltMat.side=T.DoubleSide;
  mesh(bed,cover,quiltMat,0,0,0);
  const fold=seatPad(bed,0,.660,-.305,1.80,.096,.285,finish("cotton",0xf4e9d7));
  fold.rotation.z=.011;
  const footThrow=group("床尾鼠尾草绿针织毯",0,0,.654,bed);
  footThrow.rotation.y=-Math.PI/2;
  layThrow(footThrow,0,.76,[[-.95,.48],[-.935,.61],[-.893,.691],[-.64,.702],
    [-.28,.701],[.11,.707],[.58,.708],[.846,.699],[.907,.667],[.936,.591],[.94,.461],
    [.936,.319],[.963,.198]],soft.sageKnit,-.047,0xc2c8ac);
  for(const sign of [-1,1]) {
    soft.pillow(bed,sign*.415,.864,-.703,.798,.492,finish("fabric",0xf7efde),-sign*.058,-.41);
  }
  soft.pillow(bed,-.375,.794,-.433,.585,.37,soft.stripedLinen,.064,-.32);
  soft.pillow(bed,.275,.779,-.421,.51,.332,finish("fabric",0xd7ab8f),-.089,-.36);
  soft.woolRunner(side,-1.63,1.49,.705,1.49);

  const windowRoot=group("二楼窗户",-opening.centerZ,opening.bottom-walkingHeight,.006,side);
  const w=opening.width,h=opening.top-opening.bottom;
  // Keep the opening clickable even when both leaves are swung outside.
  const openingTarget=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({visible:false,side:T.DoubleSide}));
  openingTarget.position.set(0,h/2,-.09); windowRoot.add(openingTarget);
  for(const x of [-w/2,w/2]) beveledBox(windowRoot,x,h/2,-.045,.067,h+.09,.20,edge,.025);
  beveledBox(windowRoot,0,h,-.045,w+.07,.058,.20,edge,.025);
  beveledBox(windowRoot,0,0,.005,w+.14,.066,.29,ash,.025);
  const curtains=[], sashes=[];
  for(const sign of [-1,1]) {
    const sash=group("平开窗扇",sign*(w/2-.032),.024,-.07,windowRoot);
    sashes.push(sash);
    const leafWidth=w/2-.034, cx=-sign*leafWidth/2, leafHeight=h-.054;
    for(const ex of [0,-sign*leafWidth]) box(sash,ex,leafHeight/2,0,.033,leafHeight,.034,ash);
    for(const ey of [.019,leafHeight-.019]) box(sash,cx,ey,0,leafWidth,.038,.034,ash);
    const glass=mesh(sash,new T.PlaneGeometry(leafWidth-.04,leafHeight-.06),paneGlass,cx,leafHeight/2,0);
    glass.name="卧室透明窗玻璃";
    glass.castShadow=false;
    box(sash,-sign*(leafWidth-.055),leafHeight*.43,.032,.022,.105,.025,brass);
    const curtain=group("亚麻窗帘",sign*(w/2+.085),-.055,.14,windowRoot);
    curtains.push(curtain);
    const clothW=w/2+.095,clothH=h+.16;
    // A subdivided solid keeps a real folded hem and side returns, even when gathered.
    const fabric=new T.BoxGeometry(clothW,clothH,.022,48,12,1);
    const points=fabric.attributes.position,uv=fabric.attributes.uv,shading=[];
    for(let i=0;i<points.count;i++) {
      const u=.5+points.getX(i)/clothW,v=.5+points.getY(i)/clothH,depth=points.getZ(i);
      const hem=1-v, fullness=1+.19*hem;
      const fold=Math.cos(u*7*Math.PI+.98*hem*Math.sin(u*7+sign*.45));
      points.setXYZ(i,-sign*u*clothW*fullness,v*clothH-.038*hem*(1-fold)-.018*Math.sin(u*Math.PI)**2,
        depth+(.046+.055*hem)*fold+.035*Math.sin(v*Math.PI+sign*u*.19));
      uv.setXY(i,u,v);
      const occlusion=.86+.14*(.5+.5*fold);
      shading.push(occlusion,occlusion,occlusion);
    }
    fabric.computeVertexNormals();
    fabric.setAttribute("color",new T.Float32BufferAttribute(shading,3));
    const drape=mesh(curtain,fabric,0xc8ab88,0,0,0);
    drape.material=new T.MeshStandardMaterial({color:0xf5e5c9,map:weave,vertexColors:true,side:T.DoubleSide,roughness:1});
  }
  beam(windowRoot,[-w/2-.15,h+.12,.14],[w/2+.15,h+.12,.14],.019,brass);
  const windowLabels=["拉开窗帘","打开窗户","关闭窗户","关闭窗帘"];
  let step=1, gather=1, angle=0, motion=null;
  curtains.forEach(c=>{c.scale.x=.30;});
  function advanceWindow() {
    step=(step+1)%4;
    motion={start:performance.now(),gather,angle};
  }
  function animateWindow(now,reducedMotion) {
    if(!motion) return false;
    const t=reducedMotion?1:T.MathUtils.clamp((now-motion.start)/410,0,1);
    const blend=t*t*(3-2*t);
    const goalGather=step===0?0:1, goalAngle=step===2?1:0;
    gather=T.MathUtils.lerp(motion.gather,goalGather,blend);
    angle=T.MathUtils.lerp(motion.angle,goalAngle,blend);
    curtains.forEach(c=>{c.scale.x=1-.70*gather;});
    sashes[0].rotation.y=angle*1.26; sashes[1].rotation.y=-angle*1.26;
    if(t===1) motion=null;
    return true; // The settled curtain pose also needs one shadow update.
  }
  const cabinet=group("绿植边柜",1.26,0,.36,side);
  footprint(cabinet,0,0,0,1.15,.65);
  beveledBox(cabinet,0,.33,0,1.03,.66,.53,ash);
  beveledBox(cabinet,0,.714,0,1.11,.052,.60,edge);
  for(const x of [-.247,.247]) {
    beveledBox(cabinet,x,.36,.27,.456,.49,.032,finish("satin",0xb6c4b1));
    ellipsoid(cabinet,x*.32,.43,.30,.021,.022,.017,brass);
  }
  houseplant(cabinet,-.25,.74,.02,.88,ivory,0x667f53,.9);
  houseplant(cabinet,.25,.74,-.04,.64,0xbc8565,0x779347,1.08);
  const spines=[0x9bad98,0xd9b999,0xe1d4b8,0xa0b9bf,0xe7ddc9,0xbdab94];
  function books(g,start,y,z,count) {
    footprint(g,start+(count-1)*.071/2,y,z,count*.071+.018,.17);
    for(let i=0;i<count;i++) {
      const height=.20+.045*((i*5)%4), x=start+i*.071;
      box(g,x,y+height/2,z,.061,height,.145,spines[i%spines.length]);
      box(g,x,y+.055,z+.074,.049,.011,.005,ivory);
    }
  }
  cushion(side,.98,1.587,.13,.68,.038,.25,edge,.010);
  books(side,.77,1.606,.13,4);
  houseplant(side,1.18,1.606,.13,.50,ivory,0x5e794c,1.15);
  const sconce=fixture(side,1.67,1.85,.15,true);

  const rear=group("二楼后墙家具",0,0,back+skin,room);
  const desk=group("双人电脑桌",-1.30,0,.48,rear);
  const deskFrame=finish("brushed",0x647785);
  beveledBox(desk,0,.782,0,2.13,.043,.68,ash);
  for(const x of [-.93,.93]) {
    for(const z of [-.24,.24]) groundedLeg(desk,[x*1.04,.012,z*1.13],[x,.753,z],.022,deskFrame,.030);
    cushion(desk,x,.730,0,.059,.061,.54,deskFrame,.010);
  }
  box(desk,0,.713,-.231,1.89,.070,.046,deskFrame);
  const keyPattern=paintedTexture(256,80,ctx=>{
    ctx.fillStyle="#a5aaa7"; ctx.fillRect(0,0,256,80);
    ctx.fillStyle="#eeeae1";
    for(let r=0;r<4;r++) for(let k=0;k<13;k++) ctx.fillRect(5+k*19,5+r*14,16,11);
    ctx.fillRect(60,62,130,11);
  });
  const keys=new T.MeshStandardMaterial({map:keyPattern,roughness:.56});
  const notebook=group("桌上笔记本",.015,.804,.17,desk);
  footprint(notebook,0,0,0,.21,.16);
  notebook.rotation.y=-.16;
  cushion(notebook,0,.008,0,.18,.016,.135,finish("satin",0x537779));
  box(notebook,0,.020,0,.174,.011,.13,ivory);
  cushion(notebook,0,.030,0,.18,.009,.135,finish("fabric",0x94b1a7));
  beam(notebook,[-.05,.042,-.025],[.073,.042,.017],.006,brass);
  notebook.scale.set(1.49,1.26,1.39);
  soft.mug(desk,.859,.804,.144,1.18,0xb88366,-.25);
  houseplant(desk,-.929,.804,.028,.88,0xc99170,0x68845c,.95);
  turned(desk,.067,.804,-.113,[[0,0],[.058,0],[.066,.143],[.055,.146],[.051,.021],[0,.020]],
    finish("ceramic",0x819d91),24);
  for(const [dx,dz,h,color] of [[-.034,.013,.235,0xac7751],[.028,-.014,.257,0x546f71],[.008,.024,.224,0xc89865]]) {
    beam(desk,[.067+dx*.44,.848,-.113],[.067+dx*1.6,.804+h,-.113+dz],.008,finish("wood",color));
  }
  for(const x of [-.52,.52]) {
    footprint(desk,x,.8035,-.099,.31,.22);
    cushion(desk,x,.815,-.099,.258,.024,.181,deskFrame,.010);
    beam(desk,[x,.826,-.113],[x,1.097,-.215],.018,deskFrame,.025);
    cylinder(desk,x,1.083,-.195,.035,.035,.097,deskFrame,16).rotation.x=Math.PI/2;
    cushion(desk,x,1.15,-.145,.65,.40,.05,finish("satin",0x333e44));
    const display=mesh(desk,new T.PlaneGeometry(.595,.333),ivory,x,1.15,-.117);
    const displayUV=display.geometry.attributes.uv;
    for(let i=0;i<displayUV.count;i++) displayUV.setXY(i,(1.01+.98*displayUV.getX(i))/3,.09+.82*displayUV.getY(i));
    display.material=new T.MeshBasicMaterial({map:printAtlas});
    cushion(desk,x,.817,.16,.39,.026,.125,finish("brushed",0xc4c8c2));
    mesh(desk,new T.PlaneGeometry(.376,.113),keys,x,.831,.16).rotation.x=-Math.PI/2;
    ellipsoid(desk,x+.28,.827,.16,.038,.022,.058,finish("satin",0x758285));
    const chair=group("书椅",x,0,.66,desk);
    cushion(chair,0,.415,.005,.458,.045,.422,ash,.018);
    seatPad(chair,0,.459,-.003,.455,.080,.423,sage);
    for(const dx of [-.16,.16]) for(const dz of [-.15,.15]) groundedLeg(chair,[dx*1.22,.012,dz*1.22],[dx,.416,dz],.019,edge,.026,.04);
    for(const dx of [-.157,.157])
      beam(chair,[dx,.41,.151],[dx*1.10,.80,.193],.020,edge,.024,.04);
    bentBack(chair,0,.766,.215,.468,.258,.036,-.059,ash).rotation.x=.13;
    backPad(chair,0,.773,.171,.388,.191,.062,sage,.11);
  }
  cushion(rear,-1.30,1.805,.15,1.84,.050,.30,ash,.011);
  box(rear,-1.30,1.776,.119,1.79,.020,.215,edge);
  for(const x of [-2.08,-.52]) box(rear,x,1.72,.10,.04,.15,.16,ash);
  books(rear,-2.05,1.83,.15,7);
  clothboundBook(rear,-1.24,1.830,.145,.305,.17,.049,0xb8c8b4,.045);
  clothboundBook(rear,-1.26,1.879,.137,.266,.151,.041,0xd5bfa6,-.072);
  houseplant(rear,-.65,1.83,.15,.58,ivory,0x668152,.84);

  const shelfStrip=new T.MeshStandardMaterial({color:0xffead0,emissive:0xffddba,emissiveIntensity:.62});
  box(rear,-1.30,1.76,.18,1.72,.016,.055,shelfStrip);
  const shelfLight=new T.PointLight(0xffefda,1.52,2.62,1.6);
  shelfLight.position.set(-1.30,1.69,.52); rear.add(shelfLight);
  for(let j=0;j<3;j++) {
    const top=[-.61+j*.048,2.10,.24];
    const end=[top[0]-.11,1.46+j*.095,.31];
    beam(rear,top,end,.008,0x607047);
    for(let k=1;k<=6;k++) {
      const t=k/6,x=top[0]+(end[0]-top[0])*t,y=top[1]+(end[1]-top[1])*t;
      ellipsoid(rear,x+Math.sin(k*3+j)*.041,y,.32,.044,.063,.022,0x759150).rotation.z=k%2?.58:-.48;
    }
  }
  const gallery=group("海岸风景画墙",1.06,1.70,.035,rear);
  const board=group("书桌软木留言板",-2.97,1.48,.044,rear);
  cushion(board,0,0,0,1.16,.774,.055,edge,.012);
  const cork=paintedTexture(256,160,ctx=>{
    ctx.fillStyle="#b58156";ctx.fillRect(0,0,256,160);
    let seed=735;
    function sample(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    for(let i=0;i<7100;i++) {
      ctx.fillStyle=i%3?"rgba(114,73,43,.18)":"rgba(246,215,163,.47)";
      ctx.fillRect(sample()*256,sample()*160,1+sample()*2,1+sample()*1.6);
    }
  });
  box(board,0,0,.033,1.108,.721,.012,new T.MeshStandardMaterial({map:cork,roughness:1}));
  for(const [x,y,w,h,angle,color,photo] of [[-.30,.089,.33,.32,.09,ivory,0],
    [.080,.105,.214,.194,-.07,0xd4dec1,-1],[.331,-.039,.233,.271,-.12,ivory,2],
    [-.104,-.169,.221,.152,.055,0xf3c994,-1]]) {
    const slip=group(photo<0?"便签":"旅行照片",x,y,.045,board);
    slip.rotation.z=angle;box(slip,0,0,0,w,h,.009,color);
    if(photo>=0) {
      const face=new T.PlaneGeometry(w-.03,h-.061),uv=face.attributes.uv;
      for(let i=0;i<uv.count;i++) uv.setX(i,(photo+.03+.94*uv.getX(i))/3);
      mesh(slip,face,new T.MeshStandardMaterial({map:printAtlas,roughness:.94}),0,.011,.007);
    } else {
      for(let i=0;i<3;i++) box(slip,-.014,-.005-i*.024,.006,w*(.62-i*.11),.006,.002,0x9d8d73);
    }
    ellipsoid(slip,0,h*.38,.018,.015,.015,.012,photo===0?0xb76f55:0x527973);
  }
  for(const [x,y,w,h,print] of [[-.37,.17,.54,.64,0],[.19,.33,.40,.29,1],
    [.55,.33,.27,.29,2],[.29,-.12,.64,.52,1],[-.37,-.37,.38,.29,2]]) {
    framedPrint(gallery,x,y,0,w,h,print);
  }
  const seat=group("单人沙发",1.17,0,.72,rear);
  const readingBounce=new T.PointLight(0xffdfbb,.82,2.64,1.6);
  readingBounce.position.set(1.30,1.39,1.04);rear.add(readingBounce);
  contact(seat,1.27,1.12);
  for(const x of [-.392,.392]) {
    groundedLeg(seat,[x*1.07,.014,.335],[x,.369,.277],.031,edge,.045);
    groundedLeg(seat,[x*1.07,.014,-.341],[x,.768,-.305],.032,edge,.046);
    beam(seat,[x,.439,.279],[x,.608,.255],.029,ash,.035);
    cushion(seat,x,.621,-.006,.101,.067,.733,ash,.031).rotation.x=.035;
  }
  cushion(seat,0,.329,0,.934,.124,.813,ash,.033);
  seatPad(seat,0,.447,.026,.832,.198,.748,finish("fabric",0xe2d5ba));
  backPad(seat,0,.686,-.291,.886,.563,.204,finish("fabric",0xe2d5ba),-.18);
  soft.pillow(seat,-.125,.731,-.086,.492,.439,soft.stripedLinen,.15);
  layThrow(seat,.195,.373,[[-.391,.959],[-.341,.988],[-.268,.986],[-.216,.941],[-.194,.864],[-.16,.733],[-.09,.571],
    [.04,.559],[.245,.563],[.365,.535],[.412,.46],[.429,.31],[.451,.135]],
    soft.sageKnit,.021,0xc3c9ad);
  return {room,windowRoot,bedside,sconce,advanceWindow,animateWindow,windowLabel:()=>windowLabels[step]};
}
