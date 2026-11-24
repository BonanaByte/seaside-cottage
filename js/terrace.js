/* All roof furnishings are expressed in terrace-local metres, with y=0 at deck level. */
function furnishTerrace({T,roof,front,group,mesh,box,cushion,seatPad,backPad,cylinder,beam,ellipsoid,houseplant,finish,footprint,textiles,layThrow,soft,clothboundBook}) {
  const timber=finish("wood",0xaf855e), binding=finish("fabric",0xd3b48a), canvas=0xf2e2c6;
  const tent=group("敞口帆布帐篷",-2.58,0,-1.02,roof);
  tent.rotation.y=.70; tent.scale.y=1.09;
  const sides=10, radius=1.19, peak=2.39;
  function ringPoint(i,height) {
    const angle=(i-.5)*Math.PI*2/sides;
    const r=radius*(peak-height)/(peak-.065);
    return new T.Vector3(r*Math.sin(angle),height,r*Math.cos(angle));
  }
  function clothPanel(points,indices,color) {
    const geometry=new T.BufferGeometry();
    geometry.setAttribute("position",new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));
    const uv=[];
    for(const p of points) uv.push((p.x+p.z*.38)/2.6+.5,p.y/peak);
    geometry.setAttribute("uv",new T.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const panel=mesh(tent,geometry,finish("fabric",color),0,0,0);
    panel.material=panel.material.clone(); panel.material.side=T.DoubleSide;
    return panel;
  }
  cylinder(tent,0,.039,0,radius,radius,.078,0xb59973,sides).rotation.y=-Math.PI/sides;
  const tip=new T.Vector3(0,peak,0);
  // Omit three front panels below the lintel to leave a usable entrance.
  for(let i=0;i<sides;i++) {
    const door=i===sides-1 || i<=1;
    const bottom=door?1.52:.075;
    const a=ringPoint(i,bottom), b=ringPoint(i+1,bottom);
    clothPanel([a,b,tip],[0,1,2],i%2?canvas:0xe9d6b7);
    beam(tent,a.toArray(),tip.toArray(),.011,binding);
    beam(tent,a.toArray(),b.toArray(),.016,binding);
    if(i>0 && i%2===0) {
      const foot=ringPoint(i,.04), end=foot.clone().lerp(tip,1.10);
      beam(tent,foot.toArray(),end.toArray(),.026,timber,.019);
    }
  }
  // Fold the two entrance flaps back against the outer poles.
  for(const sign of [-1,1]) {
    const side=sign===1?2:-1, inner=sign===1?1:0;
    const a=ringPoint(side,.08), b=ringPoint(side,1.52), c=ringPoint(inner,1.52);
    const tie=ringPoint(side,.71);
    const innerHem=a.clone(); innerHem.x-=sign*.17; innerHem.z+=.085;
    const ridge=tie.clone(); ridge.x-=sign*.11; ridge.z+=.09;
    clothPanel([a,b,c,ridge,innerHem],[0,1,3,1,2,3,0,3,4],0xf6e7ca);
    beam(tent,c.toArray(),ridge.toArray(),.012,binding);
    beam(tent,ridge.toArray(),innerHem.toArray(),.013,binding);
    beam(tent,tie.toArray(),ridge.toArray(),.020,timber);
  }
  cushion(tent,0,.106,.16,1.30,.092,1.015,finish("fabric",0xb69b78),.036);
  footprint(tent,0,.079,.16,1.29,.99);
  footprint(tent,0,.15,.16,1.21,.91);
  seatPad(tent,0,.216,.16,1.37,.213,1.065,finish("fabric",0xddc7a5));
  backPad(tent,0,.39,-.192,1.27,.34,.25,finish("fabric",0xdfcfb5),-.21);
  soft.pillow(tent,-.385,.56,.068,.48,.48,soft.oatKnit,.13);
  soft.pillow(tent,.323,.592,.055,.56,.55,finish("fabric",0x93ad88),-.13);
  soft.pillow(tent,-.012,.474,.261,.51,.29,finish("fabric",0xe0ac86),.06);
  soft.ovalRug(roof,"帐篷入口圆编织地毯",-1.17,-1.018,1.23,1.23);
  layThrow(tent,.075,.57,[[-.039,.337],[.27,.340],[.532,.337],[.660,.316],[.709,.253],
    [.731,.148],[.780,.092],[.924,.090]],textiles.sage,-.053);
  const warmLight=new T.PointLight(0xffd7a7,1.16,1.75,1.85);
  warmLight.name="帐篷柔暖光";
  warmLight.position.set(-.08,1.08,.42); tent.add(warmLight);

  const wire=finish("metal",0x765634);
  const bulb=new T.MeshStandardMaterial({color:0xffedd7,emissive:0xffce94,emissiveIntensity:2.15});
  const tentBulb=bulb.clone();tentBulb.emissiveIntensity=2.40;
  const bulbShape=new T.SphereGeometry(.036,10,8);
  const bulbCenters=[];
  function garland(parent,start,end,count,sag) {
    parent.updateWorldMatrix(true,false);
    const a=new T.Vector3(...start), b=new T.Vector3(...end);
    const middle=a.clone().lerp(b,.5); middle.y-=sag;
    const cable=new T.QuadraticBezierCurve3(a,middle,b);
    mesh(parent,new T.TubeGeometry(cable,24,.008,5,false),wire,0,0,0);
    for(let i=0;i<count;i++) {
      const pt=cable.getPoint((i+.5)/count);
      cylinder(parent,pt.x,pt.y-.021,pt.z,.013,.016,.042,wire,8);
      const lamp=mesh(parent,bulbShape,parent===tent?tentBulb:bulb,pt.x,pt.y-.073,pt.z);
      lamp.scale.y=1.22;lamp.castShadow=false;
      bulbCenters.push(roof.worldToLocal(parent.localToWorld(lamp.position.clone())));
    }
  }
  garland(roof,[-4.08,.68,front-.135],[-4.08,.68,-2.26],9,.25);
  garland(roof,[-4.08,.68,-2.26],[.10,.68,-2.26],8,.24);
  garland(roof,[.10,.68,-2.26],[4.04,.68,-2.26],8,.24);
  garland(tent,[-.75,.43,.65],[0,1.62,.32],5,.09);
  garland(tent,[0,1.62,.32],[.75,.43,.65],5,.09);
  // One depth-tested draw for all bulb halos. Their diameter follows the orthographic zoom.
  const haloMap=document.createElement("canvas");haloMap.width=haloMap.height=64;
  const ctx=haloMap.getContext("2d"),glow=ctx.createRadialGradient(32,32,0,32,32,32);
  glow.addColorStop(0,"rgba(255,235,197,.9)");
  glow.addColorStop(.31,"rgba(255,215,157,.48)");
  glow.addColorStop(.58,"rgba(255,198,125,.13)");
  glow.addColorStop(1,"rgba(255,192,113,0)");
  ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);
  const haloTexture=new T.CanvasTexture(haloMap);haloTexture.encoding=T.sRGBEncoding;
  const lightHaze=new T.Points(new T.BufferGeometry().setFromPoints(bulbCenters),
    new T.PointsMaterial({map:haloTexture,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
      sizeAttenuation:false,opacity:.53,toneMapped:false,fog:false}));
  lightHaze.name="仅灯珠微光晕";
  lightHaze.onBeforeRender=(renderer,scene,camera)=>{
    lightHaze.material.size=.20*camera.projectionMatrix.elements[5]*renderer.domElement.clientHeight*.5;
  };
  lightHaze.raycast=()=>{};roof.add(lightHaze);
  const lantern=group("露营提灯",-1.41,0,-.53,roof);
  footprint(lantern,0,0,0,.33,.33);
  cylinder(lantern,0,.035,0,.119,.134,.066,wire);
  cylinder(lantern,0,.185,0,.079,.086,.22,bulb);
  for(const dx of [-.087,.087]) for(const dz of [-.06,.06])
    beam(lantern,[dx,.06,dz],[dx,.32,dz],.009,wire);
  cylinder(lantern,0,.33,0,.060,.115,.08,wire);
  const handle=mesh(lantern,new T.TorusGeometry(.066,.008,6,16),wire,0,.405,0);
  handle.rotation.y=.46;

  const leafBlade=new T.BufferGeometry();
  leafBlade.setAttribute("position",new T.Float32BufferAttribute([
    0,0,0, -.055,.047,.085, 0,.074,.09, .055,.047,.085,
    -.041,.069,.17, 0,.094,.17, .041,.069,.17, 0,.045,.255
  ],3));
  leafBlade.setIndex([0,1,2,0,2,3,1,4,2,4,5,2,2,5,3,3,5,6,4,7,5,5,7,6]);
  leafBlade.computeVertexNormals();
  const greens=[0x7b8e68,0x96a57b,0x899d72,0x6b8560].map(color=>
    new T.MeshStandardMaterial({color,side:T.DoubleSide,roughness:.89}));
  function leafyPot(x,z,size,potColor) {
    const pot=group("露台阔叶盆栽",x,0,z,roof);
    pot.scale.setScalar(size);
    footprint(pot,0,0,0,.46,.46);
    cylinder(pot,0,.20,0,.255,.175,.40,finish("ceramic",potColor),24,.04);
    cylinder(pot,0,.38,0,.267,.251,.055,finish("ceramic",potColor),24,.04);
    cylinder(pot,0,.409,0,.235,.235,.010,0x5e503f,28);
    for(let i=0;i<7;i++) {
      const a=i*2.4, height=.85+.24*Math.sin(i*1.9), r=.21+.07*(i%2);
      const x1=Math.cos(a)*r,z1=Math.sin(a)*r;
      beam(pot,[0,.403,0],[x1,height,z1],.014,0x788257,.007);
      for(let j=0;j<4;j++) {
        const b=a+(j%2?-.92:.92), y=height-j*.085, f=1-j*.13;
        const leaf=new T.Mesh(leafBlade,greens[(i+j)%4]);
        leaf.position.set(x1*f,y,z1*f); leaf.rotation.y=b;
        leaf.rotateX(j*.13-.47); leaf.scale.setScalar(.87+.20*(i%3));
        leaf.castShadow=leaf.receiveShadow=true; pot.add(leaf);
      }
    }
  }
  leafyPot(-3.00,.63,1.27,0xba8056);
  leafyPot(-2.75,1.45,.78,0xe8dcc5);
  houseplant(roof,-2.23,0,.66,1.37,0xb49773,0x6c844a,.95);
  leafyPot(-.63,-1.56,.90,0xddc9aa);

  const planter=group("垂花栏杆",3.80,.52,-.64,roof);
  cushion(planter,0,0,0,.42,.35,.58,finish("wood",0xa87a50),.026);
  const flowers=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),
    new T.MeshStandardMaterial({roughness:.82}),384);
  const pose=new T.Object3D(), petal=new T.Color();
  for(let strand=0;strand<12;strand++) {
    const a=strand*2.4, length=.38+.47*(.5+.5*Math.sin(strand*3.7));
    const sx=Math.cos(a)*.22,sz=Math.sin(a)*.29;
    const vine=new T.CatmullRomCurve3([new T.Vector3(sx,.18,sz),new T.Vector3(sx+.14,.23,sz+.14),
      new T.Vector3(sx+.30,.06,sz+.26),new T.Vector3(sx+.31,-length,sz+.31)]);
    mesh(planter,new T.TubeGeometry(vine,12,.009,5,false),0x60764a,0,0,0);
    for(let k=0;k<32;k++) {
      const t=k/32,point=vine.getPoint(t),angle=k*2.4;
      pose.position.copy(point);pose.position.x+=.043*Math.cos(angle);pose.position.z+=.043*Math.sin(angle);
      const scale=.052*(1-.68*t);
      if(k<10) pose.scale.set(scale*1.6,scale*.57,scale*.76);
      else pose.scale.set(scale,scale*1.17,scale*.65);
      pose.rotation.set(.45*Math.cos(angle),angle,.6*Math.sin(angle));pose.updateMatrix();
      const i=strand*32+k;flowers.setMatrixAt(i,pose.matrix);
      flowers.setColorAt(i,petal.setHex(k<10?[0x7b8e69,0x93a27b][k%2]:[0xa597ae,0xb7a8c0,0xd9c4d3][i%3]));
    }
  }
  planter.add(flowers);

  const chair=group("露台休闲椅",.53,0,-1.19,roof);
  chair.rotation.y=.20;
  for(const x of [-.32,.32]) {
    for(const z of [-.30,.30]) footprint(chair,x,0,z,.14,.14);
    beam(chair,[x,.015,.30],[x,.69,-.25],.032,timber);
    beam(chair,[x,.015,-.30],[x,.49,.27],.032,timber);
    beam(chair,[x,.57,-.26],[x,.85,-.37],.030,timber);
    beam(chair,[x,.51,.23],[x,.55,-.26],.030,timber);
  }
  box(chair,0,.338,0,.66,.056,.55,timber);
  footprint(chair,0,.367,.012,.60,.51);
  seatPad(chair,0,.422,.012,.663,.171,.585,finish("fabric",0xe4d8bf)).rotation.x=.045;
  backPad(chair,0,.653,-.270,.628,.498,.145,finish("fabric",0xded4bd),-.33);
  soft.pillow(chair,-.129,.621,-.112,.31,.278,soft.stripedLinen,.105);
  layThrow(chair,.092,.324,[[-.399,.881],[-.354,.915],[-.287,.914],[-.245,.873],[-.208,.787],[-.173,.683],[-.119,.546],
    [-.041,.52],[.186,.517],[.283,.498],[.322,.446],[.335,.316],[.359,.154]],
    soft.aquaKnit,.051,0x91b8af);

  // One quiet leisure object beside the chair, kept below the furniture silhouette.
  const reading=group("露台合上的书",1.04,0,-.69,roof);
  clothboundBook(reading,0,.003,0,.205,.278,.037,0x93ad88,-.16);

  const scope=group("三脚架望远镜",2.67,0,-1.27,roof);
  const dark=finish("brushed",0x515856), brass=finish("brushed",0xc2a071);
  const hub=[0,1.14,0];
  for(let i=0;i<3;i++) {
    const a=i*2*Math.PI/3+.28, foot=[.54*Math.cos(a),.038,.54*Math.sin(a)];
    footprint(scope,foot[0],0,foot[2],.145,.145);
    const knee=[foot[0]*.54,.54,foot[2]*.54];
    beam(scope,foot,knee,.034,timber,.040);
    beam(scope,knee,hub,.046,timber,.060);
    cylinder(scope,knee[0],knee[1],knee[2],.053,.048,.064,dark,12);
    cylinder(scope,foot[0],.037,foot[2],.043,.046,.074,dark,12);
    beam(scope,[foot[0]*.55,.53,foot[2]*.55],[0,.43,0],.015,dark);
  }
  cylinder(scope,0,1.15,0,.118,.118,.11,dark);
  cylinder(scope,0,.448,0,.11,.075,.040,dark,16);
  cylinder(scope,0,1.225,0,.088,.085,.058,brass,20);
  for(const z of [-.11,.11])
    beam(scope,[0,1.241,z*.44],[.04,1.445,z],.033,dark,.044);
  cylinder(scope,.04,1.445,0,.042,.042,.30,brass,18).rotation.x=Math.PI/2;
  const axis=new T.Vector3(.94,.31,.12).normalize();
  const barrel=group("望远镜镜筒",.04,1.46,0,scope);
  barrel.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis);
  cylinder(barrel,0,.055,0,.148,.090,.83,brass,32);
  cylinder(barrel,0,.46,0,.154,.154,.13,dark,32);
  // A shallow optical normal bends the studio reflection across the existing flat lens.
  const lensSize=32,lensPixels=new Uint8Array(lensSize*lensSize*4);
  for(let y=0;y<lensSize;y++) for(let x=0;x<lensSize;x++) {
    const nx=.27*(2*x/(lensSize-1)-1), ny=.27*(2*y/(lensSize-1)-1), i=(y*lensSize+x)*4;
    lensPixels[i]=Math.round(127.5*(nx+1)); lensPixels[i+1]=Math.round(127.5*(ny+1));
    lensPixels[i+2]=Math.round(127.5*(1+Math.sqrt(1-nx*nx-ny*ny))); lensPixels[i+3]=255;
  }
  const lensNormals=new T.DataTexture(lensPixels,lensSize,lensSize);
  lensNormals.magFilter=lensNormals.minFilter=T.LinearFilter; lensNormals.needsUpdate=true;
  const lens=new T.MeshPhysicalMaterial({color:0x3f6978,normalMap:lensNormals,roughness:.18,ior:1.52,
    envMap:dark.envMap,envMapIntensity:.55,clearcoat:.28,clearcoatRoughness:.18});
  cylinder(barrel,0,.528,0,.118,.118,.011,lens,32);
  cylinder(barrel,0,-.41,0,.073,.056,.16,dark,24);
  cylinder(barrel,0,-.515,0,.073,.074,.061,0x534740,24);
  cylinder(barrel,0,0,0,.128,.123,.105,dark,32);
  for(const y of [-.29,.22]) cylinder(barrel,0,y,0,y<0?.104:.134,y<0?.104:.134,.035,dark,32);
}
