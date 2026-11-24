/* Coast geometry uses the same shoreline for rock placement, turf and shallow-water colour. */
function coastRadius(island,a) {
  const inlet=island.inlet ? .39*Math.exp(-((Math.cos(a)-.14)**2)/.22)*Math.max(0,Math.sin(a))**4 : 0;
  return 1+.04*Math.sin(3*a)+.025*Math.cos(5*a)-inlet;
}

const coastalWaterLevel=-.53;

const coastalWaterSettings={
  waveAmplitude:.018, waveSpeed:.105, normalStrength:.082, fresnelStrength:.46,
  // Direction in XZ, wavelength in metres, share of amplitude, relative speed.
  waves:[[.88,.47,7.2,.78,1.0],[.45,.89,4.6,.22,.76]]
};

// Periodic height fields give each normal map a seamless edge and filterable mip levels.
function waterNormalMap(T,phase) {
  const size=128,data=new Uint8Array(size*size*4),turn=2*Math.PI;
  function height(u,v) {
    const bend=.80*Math.sin(v+phase)+.48*Math.cos(2*u-v);
    const patch=.50+.23*Math.cos(u-v+phase)+.16*Math.sin(2*v+u);
    return patch*Math.sin(2*u+3*v+bend+.65*Math.sin(u-v+phase))
      +(.56-.36*patch)*Math.sin(3*u-2*v+.9*Math.cos(2*v+phase)-bend)
      +.13*Math.cos(5*v-u+phase+bend);
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x*turn/size,v=y*turn/size,step=turn/size;
    const nx=(height(u-step,v)-height(u+step,v))/(8*step);
    const nz=(height(u,v-step)-height(u,v+step))/(8*step);
    const inv=1/Math.hypot(nx,nz,1),i=4*(y*size+x);
    data[i]=Math.round(127.5*(1+nx*inv));data[i+1]=Math.round(127.5*(1+nz*inv));
    data[i+2]=Math.round(127.5*(1+inv));data[i+3]=255;
  }
  const map=new T.DataTexture(data,size,size);
  map.wrapS=map.wrapT=T.RepeatWrapping;
  map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;
  map.needsUpdate=true;
  return map;
}

// Bake radial gradients in quadrature once. A single filtered lookup animates all
// near-field sources, and overlapping disturbances add without a per-pixel source loop.
function coastalRippleField(T) {
  const size=512,span=32,data=new Uint8Array(4*size*size).fill(128);
  const texture=new T.DataTexture(data,size,size);
  texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
  texture.needsUpdate=true;
  function add(x,z,radius,reach,strength,halfLength=0,yaw=0) {
    const bound=radius+reach+halfLength,dxAxis=Math.sin(yaw),dzAxis=Math.cos(yaw);
    const pixel=v=>Math.max(0,Math.min(size-1,Math.floor((v/span+.5)*size)));
    const phase=x*1.29+z*.83;
    for(let row=pixel(z-bound);row<=pixel(z+bound);row++) {
      for(let col=pixel(x-bound);col<=pixel(x+bound);col++) {
        let dx=((col+.5)/size-.5)*span-x,dz=((row+.5)/size-.5)*span-z;
        const along=T.MathUtils.clamp(dx*dxAxis+dz*dzAxis,-halfLength,halfLength);
        dx-=along*dxAxis;dz-=along*dzAxis;
        const r=Math.hypot(dx,dz),gap=r-radius;
        if(gap>=reach || r<.001) continue;
        const nx=dx/r,nz=dz/r;
        const envelope=strength*(1-T.MathUtils.smoothstep(gap,0,reach))*(.70+.30*(nx*.8+nz*.6));
        const angle=gap*2*Math.PI/(reach*.85)+phase+.48*nx*nz;
        const c=envelope*Math.cos(angle),s=envelope*Math.sin(angle),i=4*(row*size+col);
        const slopes=[nx*c,nz*c,nx*s,nz*s];
        for(let k=0;k<4;k++) data[i+k]=T.MathUtils.clamp(Math.round(data[i+k]+127*slopes[k]),1,255);
      }
    }
    texture.needsUpdate=true;
  }
  return {texture,span,add};
}

function coastalWater({T,scene,islands}) {
  const settings=coastalWaterSettings;
  const field=coastalRippleField(T);
  const time={value:0};
  const axis=[-850,-100,-36];
  for(let i=-36;i<=36;i++) axis.push(i*.53);
  axis.push(36,100,850);
  const positions=[],colors=[],shoreDistances=[],indices=[];
  const baseTint=new T.Color(0xd4dfdf);
  const deep=new T.Color(0x7898a4), mid=new T.Color(0x9abbbc), shoal=new T.Color(0xc3dcd3),color=new T.Color();
  function distance(x,z,island) {
    const u=(x-island.x)/island.rx,v=(z-island.z)/island.rz;
    const a=Math.atan2(v,u);
    return (Math.hypot(u,v)-coastRadius(island,a))*Math.hypot(island.rx*Math.cos(a),island.rz*Math.sin(a));
  }
  for(let row=0;row<axis.length;row++) for(let col=0;col<axis.length;col++) {
    const x=axis[col],z=axis[row];
    const d=Math.min(...islands.map(island=>distance(x,z,island)));
    const shoalEdge=d+.22*Math.sin(x*1.7+z*.8)+.13*Math.cos(z*2.3);
    color.copy(shoal).lerp(mid,T.MathUtils.smoothstep(shoalEdge,.28,3.2));
    color.lerp(deep,T.MathUtils.smoothstep(d,2.0,10.5));
    color.multiplyScalar(1+.018*Math.sin(x*.7+z*.9)*Math.cos(z*.42));
    color.multiply(baseTint);
    positions.push(x,coastalWaterLevel,z);colors.push(color.r,color.g,color.b);
    shoreDistances.push(d);
    if(row && col) {
      const i=row*axis.length+col,n=axis.length;
      indices.push(i-n-1,i-1,i,i-n-1,i,i-n);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute("position",new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute("color",new T.Float32BufferAttribute(colors,3));
  geometry.setAttribute("shoreDistance",new T.Float32BufferAttribute(shoreDistances,1));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const horizon=new T.Plane(new T.Vector3(0,0,1),20);
  const sea=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,
    transparent:true,roughness:.30,metalness:0,clippingPlanes:[horizon]}));
  sea.renderOrder=-1;
  sea.material.onBeforeCompile=shader=>{
    const waves=settings.waves.map(([x,z,length,weight])=>{
      const direction=new T.Vector2(x,z).normalize();
      return new T.Vector4(direction.x,direction.y,2*Math.PI/length,weight);
    });
    Object.assign(shader.uniforms,{
      waterTime:time,amplitude:{value:settings.waveAmplitude},wave:{value:waves},
      waveRate:{value:settings.waves.map(w=>w[4])},normalStrength:{value:settings.normalStrength},
      fineA:{value:waterNormalMapA},fineB:{value:waterNormalMapB},contactField:{value:field.texture},
      fieldSpan:{value:field.span},waterSky:{value:scene.background},fresnelStrength:{value:settings.fresnelStrength}
    });
    shader.vertexShader=`
      attribute float shoreDistance;
      uniform vec4 wave[2];
      uniform float waveRate[2], waterTime, amplitude;
      varying vec3 vCoast;
      varying vec3 vWaveNormal;
    `+shader.vertexShader.replace("#include <begin_vertex>",`
      #include <begin_vertex>
      vec2 p = position.xz;
      vCoast = vec3(p,shoreDistance);
      float shallow = mix(.29,1.,smoothstep(.45,3.0,shoreDistance));
      // Fade displacement before the grid changes from 0.53 m cells to horizon triangles.
      float resolved = 1. - smoothstep(16.,19.,max(abs(p.x),abs(p.y)));
      vec3 tx=vec3(1.,0.,0.), tz=vec3(0.,0.,1.);
      for(int i=0;i<2;i++) {
        vec2 dir=wave[i].xy;
        float k=wave[i].z, a=amplitude*wave[i].w*shallow*resolved;
        float phase=k*(dot(p,dir)-waterTime*waveRate[i])+float(i)*1.9;
        float s=sin(phase), c=cos(phase);
        transformed.xz += .38*a*c*dir;
        transformed.y += a*s;
        vec3 derivative=a*k*vec3(-.38*s*dir.x,c,-.38*s*dir.y);
        tx += derivative*dir.x; tz += derivative*dir.y;
      }
      vWaveNormal=normalize(cross(tz,tx));
    `);
    shader.fragmentShader=`
      uniform sampler2D fineA, fineB, contactField, waterSky;
      uniform float waterTime, normalStrength, fieldSpan, fresnelStrength;
      varying vec3 vCoast;
      varying vec3 vWaveNormal;
    `+shader.fragmentShader.replace("#include <normal_fragment_maps>",`
      #include <normal_fragment_maps>
      vec2 p=vCoast.xy;
      mat2 turn=mat2(.8,.6,-.6,.8);
      vec2 drift=.48*vec2(sin(dot(p,vec2(.56,-.34))),cos(dot(p,vec2(.37,.58))));
      vec3 nA=texture2D(fineA,(p+drift)/5.2-waterTime*vec2(.095,.055)).xyz*2.-1.;
      vec3 nB=texture2D(fineB,turn*p/2.8+waterTime*vec2(.035,-.095)).xyz*2.-1.;
      vec2 detail=.88*nA.xy/max(nA.z,.5)+.12*(nB.xy*turn)/max(nB.z,.5);
      vec4 field=texture2D(contactField,p/fieldSpan+.5)*(255./127.)-128./127.;
      float phase=waterTime*4.2;
      vec2 localSlope=field.xy*cos(phase)+field.zw*sin(phase);
      vec2 perturb=normalStrength*(detail*mix(.45,1.,smoothstep(.3,2.8,vCoast.z))+.52*localSlope);
      vec3 waterNormal=normalize(vWaveNormal+vec3(perturb.x,0.,perturb.y));
      normal=normalize(mat3(viewMatrix)*waterNormal);
    `).replace("#include <output_fragment>",`
      float grazing=1.-clamp(dot(normal,geometry.viewDir),0.,1.);
      float shallowClarity=(1.-smoothstep(.45,1.75,vCoast.z))*mix(.54,.35,grazing*grazing);
      diffuseColor.a *= 1.-shallowClarity;
      vec3 reflected=inverseTransformDirection(reflect(-geometry.viewDir,normal),viewMatrix);
      vec2 skyUV=vec2(.5+.46*reflected.x,.42+.56*clamp(reflected.y,0.,1.));
      vec3 skyColour=texture2D(waterSky,skyUV).rgb;
      #ifdef USE_FOG
        skyColour=mix(fogColor,skyColour,.62)*vec3(.78,.87,.93);
      #endif
      outgoingLight=mix(outgoingLight,skyColour,fresnelStrength*(.025+.975*pow(grazing,3.5)));
      #include <output_fragment>`);
  };
  const waterNormalMapA=waterNormalMap(T,.3),waterNormalMapB=waterNormalMap(T,2.7);
  sea.name="近岸浅海";sea.receiveShadow=true;scene.add(sea);
  return {sea,horizon,addRipple:field.add,advance(seconds){time.value+=seconds*settings.waveSpeed;}};
}

function coastStones(T,parent,island,seededRandom,addRipple) {
  const rng=seededRandom(island.inlet?910:327),pose=new T.Object3D();
  // Grassy lip, exposed grit and damp sand wrap continuously into the water.
  const bank=[],tones=[],bankFaces=[],sections=island.inlet?120:64;
  const sandTone=new T.Color();
  for(let i=0;i<=sections;i++){
    const a=(i%sections)/sections*2*Math.PI,r=coastRadius(island,a);
    const spread=.82+.18*Math.sin(5*a)+.22*Math.cos(7*a);
    for(const [offset,h,color,opacity] of [[-.28,.154,0xbdb7a2,0],[-.05,.154,0xc4bda7,.64],
      [.16,.069,0xbfb6a0,1],[.32,-.176,0xc9c0ae,1],[.48,-.34,0xc5bcab,1],[.75,-.54,0xa9aa9d,1],
      [2.8,-.96,0x91ada8,1]]){
      const px=(island.rx*r+offset*spread)*Math.cos(a),pz=(island.rz*r+offset*spread)*Math.sin(a);
      const shoulder=islandRelief(T,island,px+island.x,pz+island.z)*(1-T.MathUtils.smoothstep(offset,-.05,.32));
      bank.push(px,h+shoulder,pz);
      sandTone.setHex(color).multiplyScalar(.96+.04*Math.cos(a*16));
      tones.push(sandTone.r,sandTone.g,sandTone.b,opacity);
    }
    const start=i*7;
    if(i) for(let j=0;j<6;j++){const v=start+j;bankFaces.push(v-7,v,v+1,v-7,v+1,v-6);}
  }
  const bankGeo=new T.BufferGeometry();bankGeo.setIndex(bankFaces);
  bankGeo.setAttribute("position",new T.Float32BufferAttribute(bank,3));
  bankGeo.setAttribute("color",new T.Float32BufferAttribute(tones,4));bankGeo.computeVertexNormals();
  const bankMesh=new T.Mesh(bankGeo,new T.MeshStandardMaterial({vertexColors:true,roughness:1,transparent:true,side:T.DoubleSide}));
  bankMesh.renderOrder=-2;bankMesh.receiveShadow=true;parent.add(bankMesh);
  // Small shingle collects on the sloping shelves, in pockets between the longer ledges.
  const pocketAngles=island.inlet?[.12,.82,1.58,2.12,2.62,3.12,4.30,5.48]:[.24,1.63,3.26,4.71];
  const pockets=pocketAngles.length,perPocket=7;
  const outcrops=Array.from({length:pockets},(_,i)=>({
    angle:pocketAngles[i]+(rng()-.5)*.13,
    width:.20+.24*rng(),
    counts:[i===2 || i===4?2:1,2+Math.floor(rng()*2),3+Math.floor(rng()*3)]
  }));
  const shingle=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({roughness:1}),pockets*perPocket);
  for(let i=0;i<pockets;i++) {
    const center=outcrops[i].angle;
    for(let j=0;j<perPocket;j++) {
      const a=center+(rng()-.5)*.11,r=coastRadius(island,a);
      const t=rng(),spread=.82+.18*Math.sin(5*a)+.22*Math.cos(7*a);
      const offset=(.32+.16*t)*spread,size=.038+.069*rng();
      pose.position.set((island.rx*r+offset)*Math.cos(a),-.17-.164*t,(island.rz*r+offset)*Math.sin(a));
      pose.scale.set(size*1.7,size*.62,size);pose.rotation.set(0,rng()*3,.15*rng());pose.updateMatrix();
      shingle.setMatrixAt(i*perPocket+j,pose.matrix);
      shingle.setColorAt(i*perPocket+j,new T.Color([0xcbc2b0,0xafafa3,0xd6cbb6][j%3]));
    }
  }
  shingle.receiveShadow=true;parent.add(shingle);
  // A low wet foot, sloping shoulder and broad broken crown instead of pointed boulders.
  const rockMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.98});
  rockMaterial.onBeforeCompile=shader=>{
    shader.uniforms.waterLevel={value:coastalWaterLevel};
    shader.vertexShader="varying float vRockHeight;\n"+shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nvRockHeight = (modelMatrix * instanceMatrix * vec4(position, 1.0)).y;");
    shader.fragmentShader="varying float vRockHeight; uniform float waterLevel;\n"+shader.fragmentShader
      .replace("#include <color_fragment>",`#include <color_fragment>
        float wet = 1.0 - smoothstep(waterLevel - .025, waterLevel + .16, vRockHeight);
        diffuseColor.rgb *= mix(vec3(1.), vec3(.75,.82,.84), wet);`)
      .replace("#include <roughnessmap_fragment>","#include <roughnessmap_fragment>\nroughnessFactor -= .23 * wet;");
  };
  const occupied=[];
  for(let family=0;family<3;family++) {
    const verts=[],colors=[],faces=[],segments=9;
    const irregular=Array.from({length:segments},()=>.82+rng()*.28);
    for(const [h,rad,tone] of [[-.84,.61,.66],[-.37,1,.77],[.28,.98,.92],[.72,.80,.99],[.91,.53,1]]) {
      for(let j=0;j<segments;j++) {
        const a=j*2*Math.PI/segments+family*.17,k=rad*irregular[j];
        verts.push(Math.cos(a)*k+.055*h,h+.07*Math.sin(2*a+family),Math.sin(a)*k);
        colors.push(tone,tone,tone);
        const n=verts.length/3-1,next=n-j+(j+1)%segments;
        if(n>=segments)faces.push(n-segments,n,next,next,next-segments,n-segments);
      }
    }
    const top=verts.length/3;verts.push(-.04,1,.02);colors.push(1,1,1);
    for(let j=0;j<segments;j++)faces.push(top,4*segments+(j+1)%segments,4*segments+j);
    const base=new T.BufferGeometry();
    base.setAttribute("position",new T.Float32BufferAttribute(verts,3));
    base.setAttribute("color",new T.Float32BufferAttribute(colors,3));base.setIndex(faces);
    const geo=base.toNonIndexed();base.dispose();geo.computeVertexNormals();
    const assignments=outcrops.flatMap(outcrop=>Array.from({length:outcrop.counts[family]},()=>outcrop));
    const count=assignments.length;
    const stones=new T.InstancedMesh(geo,rockMaterial,count);
    const palette=[0xd1c8b8,0xc0baae,0xd3c7b6,0xb3afa3,0xc6bcad];
    let placed=0;
    for(let i=0;i<count;i++){
      const outcrop=assignments[i];
      const ledge=family===0, foot=family===2;
      const s=.76+.53*rng();
      pose.scale.set((ledge?.60:foot?.17:.33)*s,(ledge?.29:foot?.10:.18)*s,(ledge?.39:foot?.14:.27)*s);
      let accepted=false;
      for(let attempt=0;attempt<32 && !accepted;attempt++) {
        const a=outcrop.angle+(rng()-.5)*outcrop.width,r=coastRadius(island,a);
        const spread=.82+.18*Math.sin(5*a)+.22*Math.cos(7*a);
        const bankOffset=ledge?.24+.16*rng():foot?.28+.43*rng():.22+.28*rng();
        const offset=bankOffset*spread;
        const level=bankOffset<.32 ? .069-(bankOffset-.16)*1.53 :
          bankOffset<.48 ? -.176-(bankOffset-.32)*1.025 : -.34-(bankOffset-.48)*.74;
        pose.position.set((island.rx*r+offset)*Math.cos(a),level-.025,(island.rz*r+offset)*Math.sin(a));
        const yaw=-a-Math.PI*.5+(rng()-.5)*2.1;
        pose.rotation.set((rng()-.5)*.24,yaw,(rng()-.5)*.20);
        const radius=(sx,sz,yaw,dx,dz)=>Math.hypot(sx*(dx*Math.cos(yaw)-dz*Math.sin(yaw)),sz*(dx*Math.sin(yaw)+dz*Math.cos(yaw)));
        accepted=occupied.every(other=>{
          const dx=other.x-pose.position.x,dz=other.z-pose.position.z,d=Math.hypot(dx,dz);
          return d>.01 && d>.87*(radius(pose.scale.x,pose.scale.z,yaw,dx/d,dz/d)+radius(other.sx,other.sz,other.yaw,dx/d,dz/d));
        });
      }
      if(!accepted) continue;
      occupied.push({x:pose.position.x,z:pose.position.z,sx:pose.scale.x,sz:pose.scale.z,yaw:pose.rotation.y});
      pose.updateMatrix();stones.setMatrixAt(placed,pose.matrix);
      if(foot) addRipple(island.x+pose.position.x,island.z+pose.position.z,pose.scale.z,.46,.32);
      stones.setColorAt(placed++,new T.Color(palette[Math.floor(rng()*palette.length)]));
    }
    stones.count=placed;stones.name=["海岸大型岩簇","海岸中型散石","浅水小型散石"][family];
    stones.receiveShadow=true;stones.castShadow=family!==2;parent.add(stones);
  }
}

function plantThrift(T,parent,seededRandom,island,groundHeight) {
  const rng=seededRandom(795);
  const patches=[[-6.91,1.93,.62,8],[-4.54,3.97,.56,7],[-3.56,3.86,.43,5],
    [4.43,-3.20,.46,4],[5.97,-2.24,.39,3]];
  const count=patches.reduce((sum,p)=>sum+p[3],0);
  const greens=new T.MeshStandardMaterial({color:0x96a083,roughness:.98});
  const flowers=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({roughness:.94}),count*4);
  const leaves=new T.InstancedMesh(new T.SphereGeometry(1,6,4),greens,count*4);
  const stems=new T.InstancedMesh(new T.CylinderGeometry(.005,.009,1,6),greens,count);
  const pose=new T.Object3D(),axis=new T.Vector3(),up=new T.Vector3(0,1,0);
  let i=0;
  const blooms=[0xd2bfba,0xe8e3d9,0xc7c0cd].map(hex=>new T.Color(hex));
  for(const [patch,[x,z,span,n]] of patches.entries()) for(let k=0;k<n;k++,i++){
    const a=rng()*2*Math.PI,r=Math.sqrt(rng())*span*.54;
    const px=x+r*Math.cos(a),pz=z+.7*r*Math.sin(a);
    const root=new T.Vector3(px,groundHeight(px,pz)-parent.position.y-.003,pz);
    const end=root.clone().add(new T.Vector3(.05*Math.cos(a),.15+.19*rng(),.055*Math.sin(a)));
    axis.subVectors(end,root);
    pose.position.copy(root).lerp(end,.5);pose.scale.set(1,axis.length(),1);
    pose.quaternion.setFromUnitVectors(up,axis.normalize());pose.updateMatrix();stems.setMatrixAt(i,pose.matrix);
    for(let j=0;j<4;j++) {
      const b=a+j*Math.PI*.5;
      pose.position.copy(root);pose.position.x+=.041*Math.cos(b);pose.position.z+=.041*Math.sin(b);pose.position.y+=.045;
      pose.rotation.set(0,-b,0);pose.rotateZ(-.76);
      pose.scale.set(.016,.088,.019);pose.updateMatrix();leaves.setMatrixAt(4*i+j,pose.matrix);
      pose.position.copy(end);pose.position.x+=.017*Math.cos(b);pose.position.z+=.017*Math.sin(b);pose.position.y+=.013*rng();
      pose.scale.set(.030,.030,.031);pose.updateMatrix();flowers.setMatrixAt(4*i+j,pose.matrix);
      flowers.setColorAt(4*i+j,blooms[patch%3]);
    }
  }
  for(const part of [leaves,stems,flowers]){part.receiveShadow=true;parent.add(part);}
  const blades=[],tints=[],color=new T.Color();
  for(const [x,z] of patches) {
    for(let blade=0;blade<15;blade++) {
      const a=rng()*Math.PI*2,r=.13*Math.sqrt(rng());
      const px=x+r*Math.cos(a),pz=z+r*Math.sin(a),h=.13+.18*rng();
      const baseY=groundHeight(px,pz)-parent.position.y-.003;
      const dx=.033+.16*Math.cos(a),dz=.13*Math.sin(a),w=.012+rng()*.010;
      const left=[px-w*Math.sin(a),baseY,pz+w*Math.cos(a)];
      const right=[px+w*Math.sin(a),baseY,pz-w*Math.cos(a)];
      const mid=[px+.27*dx,baseY+.76*h,pz+.27*dz],tip=[px+dx,baseY+h,pz+dz];
      blades.push(...left,...right,...mid,...right,...tip,...mid);
      for(const hex of [0x7e8962,0x909a6e,0xa9b183,0x909a6e,0xcbc59a,0xa9b183]) {
        color.setHex(hex);tints.push(color.r,color.g,color.b);
      }
    }
  }
  const grass=new T.BufferGeometry();grass.setAttribute("position",new T.Float32BufferAttribute(blades,3));
  grass.setAttribute("color",new T.Float32BufferAttribute(tints,3));grass.computeVertexNormals();
  const tufts=new T.Mesh(grass,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));
  tufts.receiveShadow=true;parent.add(tufts);
}

function mooredDinghy({T,group,mesh,box,beam,finish,addRipple,footprint},{pier,bitt}) {
  const boat=group("木船",-.32,-.505,5.39);
  boat.rotation.y=pier.rotation.y+.055;
  const timber=finish("wood",0xaf8d67),rail=finish("wood",0xcdb492);
  const paint=finish("satin",0x759a98),cream=finish("satin",0xe4ddc8);
  const wet=finish("satin",0x6f9091),inside=finish("wood",0xd2bda0);
  // Longitudinal stations define a closed transom, pointed bow, curved bilge and inner skin.
  const stations=[[-1.16,.012,.48],[-1.00,.188,.407],[-.74,.34,.350],[-.34,.446,.316],
    [.13,.465,.303],[.55,.422,.319],[.92,.333,.352],[1.07,.284,.378]];
  const verts=[],faces=[],uv=[],tones=[],geometry=new T.BufferGeometry();
  function strake(left,right,materialIndex) {
    const first=verts.length/3,start=faces.length;
    const shade=[1,.975,1,.988,1,.965][geometry.groups.length%6];
    for(let i=0;i<stations.length;i++){
      const [z,w,h]=stations[i];
      for(const point of [left(w,h),right(w,h)]) {
        verts.push(point[0],point[1],z);uv.push((z+1.16)/2.23,point[1]*2);
        tones.push(shade,shade,shade);
      }
      const j=first+2*i;
      if(i)faces.push(j-2,j-1,j,j-1,j+1,j);
    }
    geometry.addGroup(start,faces.length-start,materialIndex);
  }
  const materials=[wet,paint,cream,rail,inside].map(m=>{const s=m.clone();s.side=T.DoubleSide;s.vertexColors=true;return s;});
  const sheer=(s,w)=>s*Math.max(.002,w-.031);
  for(const s of [-1,1]) {
    strake(()=>[0,-.135],w=>[s*w*.70,-.028],0);
    strake(w=>[s*w*.70,-.028],(w,h)=>[s*w*.92,h*.62],1);
    strake((w,h)=>[s*w*.92,h*.62],(w,h)=>[s*w,h-.031],2);
    strake((w,h)=>[s*w,h-.031],(w,h)=>[s*w,h],3);
    strake((w,h)=>[s*w,h],(w,h)=>[sheer(s,w),h],3);
    strake((w,h)=>[sheer(s,w),h],w=>[s*w*.68,.024],4);
  }
  geometry.setAttribute("position",new T.Float32BufferAttribute(verts,3));
  geometry.setAttribute("uv",new T.Float32BufferAttribute(uv,2));geometry.setIndex(faces);geometry.computeVertexNormals();
  geometry.setAttribute("color",new T.Float32BufferAttribute(tones,3));
  const hull=new T.Mesh(geometry,materials);hull.name="浅青色搭接船壳";hull.receiveShadow=hull.castShadow=true;boat.add(hull);
  beam(boat,[0,-.125,-1.16],[0,.477,-1.16],.015,rail);
  const stern=new T.Shape();
  stern.moveTo(-.284,.378);stern.lineTo(.284,.378);stern.lineTo(.25,.17);
  stern.lineTo(.199,-.028);stern.lineTo(0,-.115);stern.lineTo(-.199,-.028);stern.lineTo(-.25,.17);stern.closePath();
  mesh(boat,new T.ExtrudeGeometry(stern,{depth:.025,bevelEnabled:false}),timber,0,0,1.052);
  for(const [i,x] of [-.16,0,.16].entries()) {
    const surface=timber.clone();surface.color.multiplyScalar([.975,1,.96][i]);
    box(boat,x,.045,.085,.148,.037,Math.abs(x)<.01?1.89:1.58,surface).name="船底拼接木板";
  }
  for(const [z,w] of [[-.46,.650],[.48,.702]])box(boat,0,.239,z,w,.047,.182,rail);
  for(const s of [-1,1]){
    const rim=new T.CatmullRomCurve3(stations.map(([z,w,h])=>new T.Vector3(s*w,h,z)));
    mesh(boat,new T.TubeGeometry(rim,36,.018,6,false),rail,0,0,0);
    for(const i of [2,3,4,5,6]){
      const [z,w,h]=stations[i];
      beam(boat,[s*(w*.68-.024),.061,z],[s*(w-.058),h-.032,z],.012,timber);
    }
  }
  const oars=group("并放木桨",0,0,0,boat);
  const bladeShape=new T.SphereGeometry(1,8,4);
  for(const [x,offset] of [[-.105,0],[.105,-.055]]) {
    beam(oars,[x,.279,-.83+offset],[x,.279,.70+offset],.016,timber,.019);
    const blade=mesh(oars,bladeShape,rail,x,.279,.805+offset);
    blade.scale.set(.057,.016,.175);
    for(const z of [-.46,.48]) footprint(boat,x,.263,z,.045,.12);
  }
  // Sling the painter between the bow eye and the nearest mooring post in world space.
  boat.updateWorldMatrix(true,false);
  const eye=boat.localToWorld(new T.Vector3(0,.439,-1.144));
  const middle=eye.clone().lerp(bitt,.51);middle.y-=.15;
  const line=new T.QuadraticBezierCurve3(eye,middle,bitt);
  mesh(boat.parent,new T.TubeGeometry(line,20,.011,6,false),finish("fabric",0xa48d6e),0,0,0).name="小船松弛系泊绳";
  const eyeRing=mesh(boat,new T.TorusGeometry(.025,.006,5,10),finish("metal",0x977a59),0,.439,-1.144);
  eyeRing.name="船首系泊环";
  addRipple(boat.position.x,boat.position.z,.30,1.15,.94,.72,boat.rotation.y);
}
