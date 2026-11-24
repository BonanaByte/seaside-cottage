/* Step 7.2: small, deterministic surface relief; all dimensions are metres. */
function islandRelief(T,lawn,x,z) {
  if(!lawn.inlet) return 0;
  const fade=(v,a,b)=>T.MathUtils.smoothstep(v,a,b);
  const rectangle=(cx,cz,rx,rz,feather)=>fade(Math.hypot(
    Math.max(0,Math.abs(x-cx)-rx),Math.max(0,Math.abs(z-cz)-rz)),0,feather);
  // Preserve the house platform, bench feet, fence line and boardwalk landings.
  const protectedArea=rectangle(-.55,-.9,4.82,3.04,.72)
    *rectangle(-4.3,2.23,1.05,.59,.50)*rectangle(-3.3,4.16,2.12,.13,.40)
    *rectangle(.32,2.83,.78,.42,.50)*rectangle(5.83,-2,.68,.56,.45);
  const u=(x-lawn.x)/lawn.rx,v=(z-lawn.z)/lawn.rz,a=Math.atan2(v,u);
  const edge=coastRadius(lawn,a)-Math.hypot(u,v);
  const root=(cx,cz,s)=>Math.exp(-((x-cx)**2+(z-cz)**2)/(s*s));
  const swell=.026*Math.sin(.91*x+.47*z)*Math.cos(1.12*z-.23*x)
    +.044*root(-7.14,1.35,.88)+.035*root(4.85,-3.55,.77);
  // Fade to the existing bank at the boundary, with a gently descending shoulder.
  return protectedArea*(swell*fade(edge,0,.14)-.034*(1-fade(edge,0,.12)));
}

function refineIslandSurface(T,geometry,lawn) {
  const source=geometry.attributes.position,uv=geometry.attributes.uv;
  const positions=[],coords=[],groups=[];
  const vertex=i=>[source.getX(i),source.getY(i),source.getZ(i),uv.getX(i),uv.getY(i)];
  const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])/2);
  const length=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  function triangle(a,b,c,cap) {
    if(cap) {
      const ab=length(a,b),bc=length(b,c),ca=length(c,a),longest=Math.max(ab,bc,ca);
      if(longest>.65) {
        if(ab===longest){const m=midpoint(a,b);triangle(a,m,c,true);triangle(m,b,c,true);}
        else if(bc===longest){const m=midpoint(b,c);triangle(a,b,m,true);triangle(a,m,c,true);}
        else {const m=midpoint(c,a);triangle(a,b,m,true);triangle(m,b,c,true);}
        return;
      }
    }
    for(const p of [a,b,c]) {
      const influence=T.MathUtils.smoothstep(p[1],.57,.709);
      positions.push(p[0],p[1]+influence*islandRelief(T,lawn,p[0]+lawn.x,p[2]+lawn.z),p[2]);
      coords.push(p[3],p[4]);
    }
  }
  for(const part of geometry.groups) {
    const start=positions.length/3;
    for(let i=part.start;i<part.start+part.count;i+=3) {
      const a=vertex(i),b=vertex(i+1),c=vertex(i+2);
      triangle(a,b,c,Math.min(a[1],b[1],c[1])>.709);
    }
    groups.push({start,count:positions.length/3-start,materialIndex:part.materialIndex});
  }
  const result=new T.BufferGeometry();
  result.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  result.setAttribute('uv',new T.Float32BufferAttribute(coords,2));
  for(const part of groups) result.addGroup(part.start,part.count,part.materialIndex);
  result.computeVertexNormals();geometry.dispose();return result;
}
