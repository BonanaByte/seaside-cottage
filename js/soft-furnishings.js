/* Small furnishings in metres. Each piece is attached to its room or host furniture. */
function createSoftFurnishings({T,group,mesh,finish,paintedTexture,turned,beam,ellipsoid,cylinder,backPad,footprint}) {
  const tau=Math.PI*2;
  const braid=paintedTexture(1024,1024,ctx=>{
    ctx.fillStyle="#dfd1b8"; ctx.fillRect(0,0,1024,1024);
    ctx.translate(512,512);
    for(let r=5;r<517;r+=9) {
      const bound=r>427 && (r<444 || r>484);
      ctx.lineWidth=8.5; ctx.strokeStyle=bound?"#b9a383":"#f3e8d2";
      ctx.beginPath(); ctx.arc(0,0,r,0,tau); ctx.stroke();
      ctx.strokeStyle=bound?"#e3d5b9":"#cdbda3"; ctx.lineWidth=1.8;
      const stitches=Math.max(6,Math.round(tau*r/10));
      ctx.beginPath();
      for(let k=0;k<stitches;k++) {
        const a=tau*(k+.5*(r%2))/stitches;
        ctx.moveTo((r-3)*Math.cos(a),(r-3)*Math.sin(a));
        ctx.lineTo((r+3)*Math.cos(a+5/r),(r+3)*Math.sin(a+5/r));
      }
      ctx.stroke();
    }
  });
  const braidedCotton=new T.MeshStandardMaterial({map:braid,roughness:.97});
  function ovalRug(parent,name,x,z,w,d) {
    const geo=new T.LatheGeometry([[0,0],[.984,0],[1,.012],[.998,.023],[.982,.033],[.945,.031],
      [.925,.035],[.88,.030],[.84,.034],[.79,.030],[.50,.032],[0,.032]].map(p=>new T.Vector2(...p)),96);
    const {position,uv}=geo.attributes;
    for(let i=0;i<position.count;i++) uv.setXY(i,.5+.497*position.getX(i),.5+.497*position.getZ(i));
    const rug=mesh(parent,geo,braidedCotton,x,.002,z);
    rug.scale.set(w/2,1,d/2); rug.name=name;
    return rug;
  }
  function woolRunner(parent,x,z,w,d) {
    const root=group("床侧羊毛小地毯",x,.003,z,parent);
    const wool=finish("fabric",0xf1e4cf);
    mesh(root,new T.RoundedBoxGeometry(w,.038,d,3,.018),wool,0,.020,0);
    // Loop pile follows offset rows. Using one instanced mesh keeps the edge soft in silhouette.
    const cols=20,rows=45;
    const loops=new T.InstancedMesh(new T.SphereGeometry(1,6,5),wool,cols*rows);
    const pose=new T.Object3D();
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
      const phase=col*11.8+row*3.7;
      pose.position.set(w*((col+.41+.18*(row%2))/cols-.5),.035,d*((row+.5)/rows-.5));
      pose.scale.set(.022,.013+.004*Math.cos(phase),.024);pose.rotation.y=phase;
      pose.updateMatrix();loops.setMatrixAt(row*cols+col,pose.matrix);
    }
    loops.receiveShadow=true;root.add(loops);
  }

  function knit(base,shadow,highlight,stripe) {
    const map=paintedTexture(384,512,ctx=>{
      ctx.fillStyle=base; ctx.fillRect(0,0,384,512);
      for(const y of [18,30,43,455,468,482]) {
        ctx.fillStyle=stripe; ctx.fillRect(0,y,384,y===30||y===468?7:3);
      }
      ctx.lineCap="round";
      for(let y=-8;y<520;y+=10) for(let x=-6;x<390;x+=12) {
        ctx.strokeStyle=shadow; ctx.lineWidth=2.6;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+1,y+6,x+5,y+9);ctx.stroke();
        ctx.strokeStyle=highlight;
        ctx.beginPath();ctx.moveTo(x+10,y);ctx.quadraticCurveTo(x+10,y+5,x+6,y+9);ctx.stroke();
      }
    });
    return new T.MeshStandardMaterial({map,bumpMap:map,bumpScale:.00045,side:T.DoubleSide,roughness:.99});
  }
  const sageKnit=knit("#8d9f88","#748b73","#a5b29b","#e9e3d5");
  const aquaKnit=knit("#8fadaa","#749795","#b1c7be","#eee5d6");
  const oatKnit=knit("#e8e0d2","#c7bcaa","#f6f0e3","#a2947e");
  const ticking=paintedTexture(256,256,ctx=>{
    ctx.fillStyle="#f7ead3"; ctx.fillRect(0,0,256,256);
    for(let x=15;x<256;x+=49) {
      ctx.fillStyle="#738f86";ctx.fillRect(x,0,8,256);ctx.fillRect(x+13,0,2,256);
    }
    ctx.fillStyle="rgba(148,119,82,.19)";
    for(let y=0;y<256;y+=3) ctx.fillRect(0,y,256,1);
  });
  const stripedLinen=new T.MeshStandardMaterial({map:ticking,roughness:.95});

  function pillow(parent,x,y,z,w,h,surface,tilt=0,lean=-.22) {
    // Rotate within the upright face, then lean the whole pillow against the seat.
    const root=group("滚边靠枕",x,y,z,parent);root.rotation.set(lean,0,tilt);
    backPad(root,0,0,0,w,h,.40*Math.min(w,h),surface);
    const rim=[];
    for(let i=0;i<56;i++) {
      const a=i*tau/56,c=Math.cos(a),s=Math.sin(a);
      const r=(Math.abs(c)**5+Math.abs(s)**5)**(-.2);
      rim.push(new T.Vector3(.492*w*r*c,.492*h*r*s,0));
    }
    mesh(root,new T.TubeGeometry(new T.CatmullRomCurve3(rim,true),64,.006,5,true),
      finish("fabric",0xd7c6a7),0,0,0);
  }
  function budVase(parent,x,y,z,size,glaze,flowers=false) {
    const vase=group("陶制枝花瓶",x,y,z,parent);vase.scale.setScalar(size);
    footprint(vase,0,0,0,.16,.16);
    turned(vase,0,0,0,[[0,0],[.06,0],[.078,.021],[.087,.087],[.076,.134],
      [.043,.159],[.037,.196],[.043,.199],[.042,.211],[.030,.211],[.029,.185]],finish("ceramic",glaze));
    for(const [dx,dy,dz] of [[-.070,.345,.022],[.065,.398,-.014],[.026,.315,.045]]) {
      beam(vase,[0,.18,0],[dx,dy,dz],.004,0x647751);
      for(const t of [.48,.77]) {
        const leaf=ellipsoid(vase,dx*t+.011,.18+(dy-.18)*t,dz*t,.026,.046,.009,0x789175);
        leaf.rotation.z=dx>0?-.73:.67;
      }
      if(flowers) ellipsoid(vase,dx,dy,dz,.032,.028,.032,0xe7b18b);
    }
  }
  function mug(parent,x,y,z,size,color,angle=0) {
    const cup=group("带柄陶杯",x,y,z,parent);
    cup.scale.setScalar(size);cup.rotation.y=angle;
    footprint(cup,0,0,0,.14,.14);
    const glaze=finish("ceramic",color);
    turned(cup,0,0,0,[[0,0],[.05,0],[.060,.014],[.072,.112],[.071,.123],[.061,.123],[.060,.107],[.044,.021],[0,.020]],glaze);
    cylinder(cup,0,.105,0,.061,.060,.003,0x60483a,24);
    const handle=mesh(cup,new T.TorusGeometry(.036,.009,8,24),glaze,.074,.069,0);
    handle.scale.y=1.1;
  }
  function caneTable(parent,x,y,z) {
    const table=group("圆形藤编茶几",x,y,z,parent);
    const cane=finish("wood",0xb78351), binding=finish("wood",0xd6aa74);
    // The crossing reeds are open to the light between the two bound hoops.
    const rods=new T.InstancedMesh(new T.CylinderGeometry(.009,.009,1,7),cane,72);
    const pose=new T.Object3D(),up=new T.Vector3(0,1,0);
    let index=0;
    for(let i=0;i<36;i++) for(const sign of [-1,1]) {
      const a=i*tau/36,b=a+sign*.40;
      const foot=new T.Vector3(.315*Math.cos(a),.036,.315*Math.sin(a));
      const top=new T.Vector3(.389*Math.cos(b),.296,.389*Math.sin(b));
      const axis=top.clone().sub(foot);
      pose.position.copy(foot).lerp(top,.5);pose.scale.y=axis.length();
      pose.quaternion.setFromUnitVectors(up,axis.normalize());pose.updateMatrix();rods.setMatrixAt(index++,pose.matrix);
    }
    rods.castShadow=rods.receiveShadow=true;table.add(rods);
    for(const [h,r] of [[.023,.318],[.048,.317],[.276,.384],[.300,.395],[.324,.398]]) {
      mesh(table,new T.TorusGeometry(r,.013,8,64),binding,0,h,0).rotation.x=Math.PI/2;
    }
    cylinder(table,0,.317,0,.393,.39,.028,cane,64);
    const inset=mesh(table,new T.CircleGeometry(.38,64),
      new T.MeshStandardMaterial({map:braid,color:0xd1ab76,roughness:.89}),0,.332,0);
    inset.rotation.x=-Math.PI/2;
    return table;
  }
  return {ovalRug,woolRunner,pillow,budVase,mug,caneTable,sageKnit,aquaKnit,oatKnit,stripedLinen};
}
