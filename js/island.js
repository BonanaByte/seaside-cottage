/* Coastal blockout. Coordinates are in metres, +Y is up and +Z faces the cutaway. */
(() => {
  "use strict";
  const canvas = document.getElementById("island");
  const status = document.getElementById("status");
  function showError(error) {
    console.error(error);
    status.textContent = "海岛未能显示，请确认浏览器支持 WebGL 后刷新。";
  }

  function start(localTextures) {
    try {
      buildIsland(localTextures);
      status.hidden = true;
    } catch (error) {
      showError(error);
    }
  }

  if (location.protocol === "file:") {
    // File pages cannot upload neighbouring image files to WebGL. The bundle
    // supplies the same image bytes as data URLs and needs no local server.
    const script = document.createElement("script");
    script.src = "assets/local-textures.js";
    script.onload = () => start(window.houseLocalTextures);
    script.onerror = () => { status.textContent = "无法读取小屋贴图，请确认 assets 文件夹完整后刷新。"; };
    document.head.appendChild(script);
  } else {
    start();
  }

  function buildIsland(localTextures) {
    const T = THREE;
    T.ColorManagement.legacyMode = false;
    const scene = new T.Scene();
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .97;
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    scene.fog = new T.Fog(0xdadeda,508,542);

    // A stable seed keeps the shoreline and the crown identical on every visit.
    function seededRandom(seed) {
      return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    }
    const random=seededRandom(752), groundRandom=seededRandom(181);

    const materials = new Map();
    function material(color) {
      if (!materials.has(color)) {
        materials.set(color, new T.MeshStandardMaterial({ color:coastalSurfaceColor(T,color,"foliage"), roughness: .88, flatShading: true }));
      }
      return materials.get(color);
    }
    const chalk = 0xf6f1e7, plaster = 0xe9dfcf, wood = 0xc5ad91, trim = 0xab927a;
    const linen = 0xeee6d8, sage = 0xadb9a8, cream = 0xf6eedc;
    function group(name, x, y, z, parent = scene) {
      const g = new T.Group();
      g.name = name; g.position.set(x,y,z); parent.add(g);
      return g;
    }
    function mesh(parent, geometry, color, x, y, z) {
      const m = new T.Mesh(geometry, color.isMaterial ? color : material(color));
      m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    const cube = new T.BoxGeometry(1,1,1);
    const round = new T.IcosahedronGeometry(1,1);
    function box(g,x,y,z,w,h,d,color) {
      const b = mesh(g,cube,color,x,y,z); b.scale.set(w,h,d); return b;
    }
    const beveledBoxes=new Map();
    function beveledBox(g,x,y,z,w,h,d,color,fraction=.04) {
      const key=[w,h,d,fraction].join(",");
      if(!beveledBoxes.has(key)) {
        const radius=Math.min(w,h,d)*fraction;
        beveledBoxes.set(key,new T.RoundedBoxGeometry(w,h,d,1,radius));
      }
      return mesh(g,beveledBoxes.get(key),color,x,y,z);
    }
    function beveledExtrusion(shape,thickness) {
      const radius=thickness*.025;
      // Extrude inward so the wall joints, window openings and floor heights stay registered.
      const geometry=new T.ExtrudeGeometry(shape,{depth:thickness-2*radius,
        bevelEnabled:true,bevelSize:radius,bevelOffset:-radius,bevelThickness:radius,bevelSegments:1});
      return geometry.translate(0,0,radius);
    }
    function cushion(g,x,y,z,w,h,d,color,radius=Math.min(w,h,d)*.28) {
      return mesh(g,new T.RoundedBoxGeometry(w,h,d,2,Math.min(radius,.12)),color,x,y,z);
    }
    // A shared sewn cushion: plump faces, a pinched perimeter and a few shallow gathers.
    const padSlices=24, padBands=12;
    const padGeometry=new T.SphereGeometry(1,padSlices,padBands);
    const padPos=padGeometry.attributes.position;
    const roundedPower=(n,p)=>Math.sign(n)*Math.abs(n)**p;
    for(let i=0;i<padPos.count;i++) {
      const u=padGeometry.attributes.uv.getX(i)*Math.PI*2;
      const ny=padPos.getY(i), ring=(1-ny*ny)**.24;
      const cos=Math.cos(u), sin=Math.sin(u);
      const radius=(Math.abs(cos)**5+Math.abs(sin)**5)**(-.2);
      const gather=.018*Math.cos(9*u+.5)*Math.exp(-((Math.abs(ny)-.26)**2)/.052);
      const seam=.017*Math.exp(-ny*ny/.009);
      const x=-cos*radius*ring*(1-seam+gather)*.5, z=sin*radius*ring*(1-seam+gather)*.5;
      padPos.setXYZ(i,x,roundedPower(ny,.70)*.5,z);
      // The warp and weft run across the fabric face rather than around a spherical pole.
      padGeometry.attributes.uv.setXY(i,.5+x,.5+z+.08*ny);
    }
    padGeometry.computeVertexNormals();
    // Sphere UVs duplicate the longitude seam and poles; make their lighting continuous.
    const padNormals=padGeometry.attributes.normal;
    const smooth=new T.Vector3(), other=new T.Vector3();
    for(let row=0;row<=padBands;row++) {
      const start=row*(padSlices+1);
      if(row===0 || row===padBands) {
        for(let col=0;col<=padSlices;col++) padNormals.setXYZ(start+col,0,row===0?1:-1,0);
      } else {
        smooth.fromBufferAttribute(padNormals,start).add(other.fromBufferAttribute(padNormals,start+padSlices)).normalize();
        for(const index of [start,start+padSlices]) padNormals.setXYZ(index,smooth.x,smooth.y,smooth.z);
      }
    }
    function seatPad(parent,x,y,z,w,h,d,surface) {
      const pad=mesh(parent,padGeometry,surface,x,y,z);
      pad.scale.set(w,h,d);
      return pad;
    }
    function backPad(parent,x,y,z,w,h,d,surface,lean=0) {
      const pad=seatPad(parent,x,y,z,w,d,h,surface);
      pad.rotation.x=Math.PI/2+lean;
      return pad;
    }
    // Bend the thickness of a laminated backrest around the sitter.
    function bentBack(parent,x,y,z,w,h,d,bow,surface) {
      const geo=new T.BoxGeometry(w,h,d,12,2,1);
      const pos=geo.attributes.position;
      for(let i=0;i<pos.count;i++) {
        const edge=2*pos.getX(i)/w, v=pos.getY(i)/h;
        pos.setXYZ(i,pos.getX(i)*(1+.10*v),pos.getY(i)-.16*h*edge*edge,pos.getZ(i)+bow*edge*edge);
      }
      geo.computeVertexNormals();
      return mesh(parent,geo,surface,x,y,z);
    }
    function turned(parent,x,y,z,profile,surface,segments=32) {
      const geo=new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),segments);
      return mesh(parent,geo,surface,x,y,z);
    }
    function ellipsoid(g,x,y,z,rx,ry,rz,color,geo=round) {
      const b = mesh(g,geo,color,x,y,z); b.scale.set(rx,ry,rz); return b;
    }
    function cylinder(g,x,y,z,top,bottom,h,color,n=20,edgeFraction=0) {
      if(edgeFraction) {
        const rim=Math.min(2*top,2*bottom,h)*edgeFraction, half=h/2, slope=(top-bottom)/h;
        const profile=[[0,-half],[bottom-rim,-half],[bottom+slope*rim,-half+rim],
          [top-slope*rim,half-rim],[top-rim,half],[0,half]];
        const part=turned(g,x,y,z,profile,color,n), normals=part.geometry.attributes.normal;
        // Match the normals across the UV seam and the two rim rings, with flat end caps.
        const radial=1/Math.hypot(1,slope);
        for(let i=0;i<=n;i++) {
          const angle=(i%n)*2*Math.PI/n;
          for(let j=0;j<profile.length;j++) {
            const k=i*profile.length+j;
            if(j<2 || j>3) normals.setXYZ(k,0,j<2?-1:1,0);
            else normals.setXYZ(k,Math.sin(angle)*radial,-slope*radial,Math.cos(angle)*radial);
          }
        }
        return part;
      }
      return mesh(g,new T.CylinderGeometry(top,bottom,h,n),color,x,y,z);
    }
    function beam(g,a,b,r,color,rTop=r,edgeFraction=0) {
      const from = new T.Vector3(...a), to = new T.Vector3(...b);
      const delta = to.clone().sub(from), center = from.clone().addScaledVector(delta,.5);
      const bar = cylinder(g,center.x,center.y,center.z,rTop,r,delta.length(),color,10,edgeFraction);
      bar.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
      return bar;
    }

    const sky = document.createElement("canvas");
    sky.width = 1024;
    sky.height = 512;
    const skyCtx = sky.getContext("2d");
    const gradient = skyCtx.createLinearGradient(0,0,0,320);
    gradient.addColorStop(0,"#8faeca");
    gradient.addColorStop(.48,"#c1d2e1");
    gradient.addColorStop(1,"#dee5e3");
    skyCtx.fillStyle = gradient;
    skyCtx.fillRect(0,0,1024,512);
    const cloudLayer=paintedCanvas(256,128,ctx=>{
      const rand=seededRandom(291);
      for(let i=0;i<85;i++) {
        const x=rand()*280-12, y=34+19*Math.sin(x*.018)+rand()*33;
        ctx.save();ctx.translate(x,y);ctx.scale(2.7,.56);
        const mist=ctx.createRadialGradient(0,0,0,0,0,14);
        mist.addColorStop(0,"rgba(243,239,230,.15)");mist.addColorStop(1,"rgba(243,239,230,0)");
        ctx.fillStyle=mist;ctx.fillRect(-14,-14,28,28);ctx.restore();
      }
    });
    skyCtx.drawImage(cloudLayer,0,0,1024,512);
    // A broad, faint horizon veil softens the sky/sea boundary without tinting the house.
    const horizonVeil=skyCtx.createLinearGradient(0,210,0,385);
    horizonVeil.addColorStop(0,"rgba(218,222,218,0)");
    horizonVeil.addColorStop(.58,"rgba(218,222,218,.18)");
    horizonVeil.addColorStop(1,"rgba(218,222,218,0)");
    skyCtx.fillStyle=horizonVeil;skyCtx.fillRect(0,210,1024,175);
    const glow = skyCtx.createRadialGradient(0,135,1,0,135,225);
    glow.addColorStop(0,"rgba(249,244,222,.72)");
    glow.addColorStop(.22,"rgba(244,230,202,.40)");
    glow.addColorStop(1,"rgba(255,215,160,0)");
    skyCtx.fillStyle = glow;
    skyCtx.fillRect(0,0,1024,512);
    const nightSky = paintedCanvas(1024,512,ctx=>{
      const twilight = ctx.createLinearGradient(0,0,0,320);
      twilight.addColorStop(0,"#101c36");
      twilight.addColorStop(.55,"#283859");
      twilight.addColorStop(1,"#56637b");
      ctx.fillStyle = twilight;
      ctx.fillRect(0,0,1024,512);
      const stars = seededRandom(183);
      for(let i=0;i<200;i++) {
        const x=stars()*1024, y=stars()*255;
        ctx.fillStyle = `rgba(229,238,255,${(.35+stars()*.55)*(1-y/285)})`;
        ctx.beginPath(); ctx.arc(x,y,.45+stars()*.75,0,2*Math.PI); ctx.fill();
      }
    });
    scene.background = paintedTexture(1024,512,ctx=>ctx.drawImage(sky,0,0));
    scene.background.generateMipmaps = false;
    scene.background.minFilter = T.LinearFilter;
    const backgroundCtx = scene.background.image.getContext("2d");

    const skyFill=.38, daylightKey=1.55;
    const hemi = new T.HemisphereLight(0xe5efff,0xb4a392,skyFill);
    scene.add(hemi);
    // About 5000 K, from the upper left of the overview and through the open front.
    const sun = new T.DirectionalLight(0xffe4ce,daylightKey);
    sun.target.position.set(-.55,2,-.9);
    sun.position.set(1.0,17.0,11.4); scene.add(sun,sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-12,right:15,top:13,bottom:-11,near:.5,far:42});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.radius=3.8; sun.shadow.normalBias=.010; sun.shadow.bias=-.00010;

    const lawns=[
      {name:"主岛",x:-.85,z:0,rx:8.15,rz:5.5,inlet:true},
      {name:"灯塔小岛",x:10,z:-5.9,rx:2.1,rz:1.63,inlet:false}
    ];
    const water=coastalWater({T,scene,islands:lawns});
    const {sea,horizon,addRipple}=water;

    // Periodic noise grids give the ground broad tonal variation and fine grain
    // without visible seams or external texture downloads.
    function surfaceTexture(base,grain,mottling) {
      const size=512;
      const layers=[4,11,32,96].map(cells=>({
        cells, values:Float32Array.from({length:cells*cells},()=>groundRandom()-.5)
      }));
      const texture=paintedTexture(size,size,ctx=>{
        const pixels=ctx.createImageData(size,size);
        for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
          let value=0, amplitude=1;
          for(const {cells,values} of layers) {
            const u=x*cells/size, v=y*cells/size;
            const col=Math.floor(u), row=Math.floor(v);
            const nextCol=(col+1)%cells, nextRow=(row+1)%cells;
            const fx=u-col, fy=v-row;
            const sx=fx*fx*(3-2*fx), sy=fy*fy*(3-2*fy);
            const top=T.MathUtils.lerp(values[row*cells+col],values[row*cells+nextCol],sx);
            const bottom=T.MathUtils.lerp(values[nextRow*cells+col],values[nextRow*cells+nextCol],sx);
            value+=T.MathUtils.lerp(top,bottom,sy)*amplitude;
            amplitude*=.66;
          }
          const shade=value*mottling+(groundRandom()-.5)*grain;
          const i=(y*size+x)*4;
          for(let c=0;c<3;c++) pixels.data[i+c]=base[c]+shade;
          pixels.data[i+3]=255;
        }
        ctx.putImageData(pixels,0,0);
      });
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
      return texture;
    }
    const sod=surfaceTexture([153,164,133],6,26);
    sod.repeat.set(.22,.22);
    const turf=new T.MeshStandardMaterial({map:sod,bumpMap:sod,bumpScale:.014,roughness:1});
    const groundMeshes=[];
    for(const lawn of lawns) {
      const {name,x,z,rx,rz}=lawn,count=lawn.inlet?100:48;
      const g=group(name,x,0,z);
      const points = [];
      for(let i=0;i<count;i++) {
        const a=i/count*Math.PI*2, r=coastRadius(lawn,a);
        points.push([rx*r*Math.cos(a),rz*r*Math.sin(a)]);
      }
      const shape=new T.Shape(points.map(([px,pz])=>new T.Vector2(px,-pz)));
      const geo=new T.ExtrudeGeometry(shape,{depth:.57,bevelEnabled:true,bevelSize:.18,bevelThickness:.14,bevelSegments:2});
      geo.rotateX(-Math.PI/2);
      const island=mesh(g,lawn.inlet?refineIslandSurface(T,geo,lawn):geo,0xb7ac8d,0,-.56,0);
      island.material=[turf,island.material];
      island.name="草地与岛基";
      island.updateWorldMatrix(true,false);groundMeshes.push(island);
      coastStones(T,g,lawn,seededRandom,addRipple);
    }
    const groundRay=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0));
    function groundHeight(x,z) {
      groundRay.ray.origin.set(x,2,z);
      const hit=groundRay.intersectObjects(groundMeshes,false)[0];
      return hit?hit.point.y:.15;
    }

    const ground=.18, story=2.9, width=8.4, depth=4.85;
    const house=group("双层剖面小屋",-.55,ground,-.9);
    const footprints=[];
    // Coordinates are relative to the support. Resolve parent transforms after furnishing the house.
    function footprint(parent,x,y,z,w,d,angle=0) {
      footprints.push({parent,x,y,z,w,d,angle});
    }
    function groundedLeg(parent,foot,top,r,surface,rTop=r,edgeFraction=0) {
      const lean=Math.hypot(top[0]-foot[0],top[2]-foot[2]);
      const baseY=r*lean/Math.hypot(lean,top[1]-foot[1]);
      footprint(parent,foot[0],0,foot[2],r*4.5,r*4.5);
      return beam(parent,[foot[0],baseY,foot[2]],top,r,surface,rTop,edgeFraction);
    }
    function paintedCanvas(w,h,draw) {
      const surface=document.createElement("canvas");
      surface.width=w; surface.height=h;
      draw(surface.getContext("2d"));
      return surface;
    }
    function paintedTexture(w,h,draw) {
      const texture=new T.CanvasTexture(paintedCanvas(w,h,draw));
      texture.encoding=T.sRGBEncoding;
      texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      return texture;
    }
    // Floor UVs are in house-local metres. Map repetition sets the plank size on every slab.
    const textureManager=new T.LoadingManager();
    if(localTextures) textureManager.setURLModifier(path=>localTextures[path] ?? path);
    const textureLoader=new T.TextureLoader(textureManager);
    function plankFinish(name,tileLength,tileWidth,bumpScale,roughness) {
      const map=textureLoader.load("assets/finishes/"+name+"-color.jpg",invalidate);
      const relief=textureLoader.load("assets/finishes/"+name+"-surface.png",invalidate);
      // Three r147 uses encoding for texture colour space. R is height, G is roughness.
      map.encoding=T.sRGBEncoding;
      relief.encoding=T.LinearEncoding;
      for(const texture of [map,relief]) {
        texture.wrapS=texture.wrapT=T.RepeatWrapping;
        texture.repeat.set(1/tileLength,1/tileWidth);
        texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      }
      return new T.MeshStandardMaterial({map,bumpMap:relief,bumpScale,roughnessMap:relief,roughness});
    }
    const oak=plankFinish("oak",3.60,1.44,.0009,.85);
    oak.color.setHex(0xeff3f5); // Counter the orange albedo gently, preserving wood grain.
    const decking=plankFinish("deck",4.80,1.20,.0016,.91);
    decking.color.setHex(0xd0cbd0);
    const fascia=new T.MeshStandardMaterial({color:0xe9d9c3,roughness:.82});
    function floorUV(geo) {
      const {position,uv}=geo.attributes;
      for(let i=0;i<uv.count;i++) uv.setXY(i,position.getX(i),position.getY(i));
    }
    const floorGeometry=new T.PlaneGeometry(width-.07,depth-.07);
    floorUV(floorGeometry);
    const floorSurface=new T.Mesh(floorGeometry,oak);
    floorSurface.rotation.x=-Math.PI/2;
    floorSurface.position.y=.149;
    floorSurface.receiveShadow=true;
    house.add(floorSurface);
    const opening={centerZ:.87, width:1.72, bottom:1.45, top:2.22};
    beveledBox(house,0,0,0,width,.2,depth,fascia,.025);
    beveledBox(house,0,.12,0,width-.06,.055,depth-.06,wood,.025);
    const left=-width/2, right=width/2, back=-depth/2, front=depth/2;
    const insideX=left+2.75, insideZ=-.375, skin=.14, roofBase=2*story-.10;
    const walkingHeight=story+.11;
    const upstairsWindow={centerZ:.46,width:1.62,bottom:walkingHeight+1.24,top:walkingHeight+2.10};
    // The side wall has one continuous front edge from the ground floor to the roof.
    beveledBox(house,0,(roofBase+.10)/2,back+skin/2,width,roofBase-.10,skin,chalk,.025);
    const sideWall=new T.Shape();
    sideWall.moveTo(-(back+skin),.10); sideWall.lineTo(-front,.10);
    sideWall.lineTo(-front,roofBase); sideWall.lineTo(-(back+skin),roofBase); sideWall.closePath();
    for(const aperture of [opening,upstairsWindow]) {
      const u=-aperture.centerZ,w=aperture.width/2;
      const hole=new T.Path();
      hole.moveTo(u-w,aperture.bottom); hole.lineTo(u+w,aperture.bottom);
      hole.lineTo(u+w,aperture.top); hole.lineTo(u-w,aperture.top); hole.closePath();
      sideWall.holes.push(hole);
    }
    const wallGeometry=beveledExtrusion(sideWall,skin);
    wallGeometry.rotateY(Math.PI/2);
    mesh(house,wallGeometry,chalk,left,0,0);

    // The intermediate slab meets the inner faces; the roof caps both walls.
    const slabThickness=.21;
    function upperSlab(name,level) {
      const inset=level===1?skin:0;
      const footprint=new T.Shape();
      footprint.moveTo(left+inset,-back-inset);
      footprint.lineTo(right,-back-inset);
      footprint.lineTo(right,-insideZ);
      footprint.lineTo(insideX,-insideZ);
      footprint.lineTo(insideX,-front);
      footprint.lineTo(left+inset,-front);
      footprint.closePath();
      const slabGeometry=beveledExtrusion(footprint,slabThickness);
      floorUV(slabGeometry);
      // ExtrudeGeometry emits the lower cap, upper cap and edge faces in that order.
      const capCount=slabGeometry.groups[0].count/2;
      const edges=slabGeometry.groups[1];
      slabGeometry.clearGroups();
      slabGeometry.addGroup(0,capCount,1);
      slabGeometry.addGroup(capCount,capCount,0);
      slabGeometry.addGroup(edges.start,edges.count,1);
      slabGeometry.rotateX(-Math.PI/2);
      const slab=new T.Mesh(slabGeometry,[level===1?oak:decking,fascia]);
      slab.name=name; slab.position.y=level*story-.10;
      slab.receiveShadow=slab.castShadow=true;
      house.add(slab);
    }
    upperSlab("二楼 L 形楼板",1);
    upperSlab("屋顶 L 形露台",2);
    beveledBox(house,right-.07,(walkingHeight+roofBase)/2,back+skin+.46,.14,roofBase-walkingHeight,.92,plaster,.025);
    function balustrade(g,corners,y,height) {
      for(let side=1;side<corners.length;side++) {
        const a=corners[side-1], b=corners[side];
        const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.65);
        for(let i=side===1?0:1;i<=steps;i++) {
          const t=i/steps;
          beveledBox(g,a[0]+(b[0]-a[0])*t,y+height/2,a[1]+(b[1]-a[1])*t,.075,height,.075,finish("wood",trim),.025);
          footprint(g,a[0]+(b[0]-a[0])*t,y,a[1]+(b[1]-a[1])*t,.14,.14);
        }
        beam(g,[a[0],y+height,a[1]],[b[0],y+height,b[1]],.07,finish("wood",wood),.07,.025);
      }
    }
    const weave=paintedTexture(64,64,ctx=>{
      ctx.fillStyle="#f5f1e7"; ctx.fillRect(0,0,64,64);
      for(let i=0;i<64;i+=4) {
        ctx.fillStyle="rgba(110,93,70,.18)"; ctx.fillRect(i,0,1,64);
        ctx.fillStyle="rgba(255,255,255,.6)"; ctx.fillRect(0,i,64,1);
      }
    });
    weave.wrapS=weave.wrapT=T.RepeatWrapping;
    weave.repeat.set(6,4);
    // Use studio reflections on the furnishings while the island keeps its outdoor light.
    const studio = new T.RoomEnvironment();
    const pmrem = new T.PMREMGenerator(renderer);
    const reflection = pmrem.fromScene(studio,.04).texture;
    studio.dispose();
    pmrem.dispose();
    oak.envMap=reflection;
    oak.envMapIntensity=.24;
    decking.envMap=reflection;
    decking.envMapIntensity=1;
    const grain = paintedTexture(512,128,ctx=>{
      ctx.fillStyle="#fff9ef"; ctx.fillRect(0,0,512,128);
      const rand=seededRandom(743);
      for(let i=0;i<140;i++) {
        const y=rand()*128, phase=rand()*6, bend=1+rand()*3;
        ctx.strokeStyle=i%4 ? "rgba(136,93,56,.067)" : "rgba(255,255,255,.38)";
        ctx.lineWidth=.4+rand()*1.4; ctx.beginPath();
        for(let x=0;x<=512;x+=8) {
          const v=y+bend*Math.sin(x/82+phase)+.9*Math.sin(x/37+phase);
          if(x===0) ctx.moveTo(x,v); else ctx.lineTo(x,v);
        }
        ctx.stroke();
      }
    });
    const finishes = {
      wood:{map:grain,roughness:.76,envMapIntensity:.20},
      oiledWood:{map:grain,roughness:.60,envMapIntensity:.28},
      fabric:{map:weave,roughness:.97,envMapIntensity:.15},
      cotton:{map:weave,roughness:.91,envMapIntensity:.17},
      enamel:{roughness:.43,metalness:.09,envMapIntensity:.35},
      ceramic:{roughness:.34,envMapIntensity:.37},
      metal:{roughness:.31,metalness:.83,envMapIntensity:.55},
      leather:{roughness:.56,envMapIntensity:.22},
      brushed:{roughness:.40,metalness:.75,envMapIntensity:.50},
      satin:{roughness:.54,metalness:.025,envMapIntensity:.26}
    };
    const finishCache=new Map();
    function finish(type,color) {
      const key=type+color;
      if(!finishCache.has(key)) finishCache.set(key,new T.MeshStandardMaterial({
        color:coastalSurfaceColor(T,color,type),envMap:reflection,...finishes[type]
      }));
      return finishCache.get(key);
    }
    balustrade(house,[[right-1.65,insideZ-.09],[right-.10,insideZ-.09],[right-.10,back+.93]],walkingHeight,.70);
    const roofRail=group("屋顶外沿栏杆",0,0,0,house);
    balustrade(roofRail,[[left+.10,front-.10],[left+.10,back+.10],
      [right-.10,back+.10],[right-.10,insideZ-.09]],walkingHeight+story,.70);

    // A thin pane uses the existing reflection probe without a refraction render pass.
    const paneGlass=new T.MeshPhysicalMaterial({color:0xe6eeec,roughness:.12,ior:1.48,
      envMap:reflection,envMapIntensity:.18,transparent:true,opacity:.035,side:T.DoubleSide,depthWrite:false});
    paneGlass.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace("#include <output_fragment>",
        `float viewCosine = abs(dot(normal, geometry.viewDir));
         diffuseColor.a += 0.08 * pow(1.0 - clamp(viewCosine, 0.0, 1.0), 4.0);
         #include <output_fragment>`);
    };
    // The bulb transmits most light through the middle of the linen, less through the hems.
    // Three r147 shares one UV transform for diffuse and emission. Tile the yarn here
    // so the transmission gradient spans the shade exactly once.
    const shadeWeave=paintedTexture(384,256,ctx=>{
      ctx.fillStyle=ctx.createPattern(weave.image,"repeat");ctx.fillRect(0,0,384,256);
    });
    const shadeTransmission=paintedTexture(16,128,ctx=>{
      const light=ctx.createLinearGradient(0,0,0,128);
      light.addColorStop(0,"#82786c");light.addColorStop(.25,"#cdbda4");
      light.addColorStop(.65,"#fff1d8");light.addColorStop(.92,"#eddeca");
      light.addColorStop(1,"#ac9b83");
      ctx.fillStyle=light;ctx.fillRect(0,0,16,128);
    });
    function lightLinenShade(shade) {
      const geometry=shade.geometry, {uv,position}=geometry.attributes;
      geometry.computeBoundingBox();
      const {min,max}=geometry.boundingBox;
      for(let i=0;i<uv.count;i++) uv.setY(i,(position.getY(i)-min.y)/(max.y-min.y));
      shade.material=shade.material.clone();
      shade.material.map=shadeWeave;
      shade.material.color.multiplyScalar(.73);
      shade.material.emissiveMap=shadeTransmission;
      shade.material.emissive.setHex(0xffc38d);
      shade.material.emissiveIntensity=1.12;
    }
    // Stripes are woven into the surface, including the hem, so each textile draws as one mesh.
    function wovenCloth(ground,yarn,selvedge) {
      const map=paintedTexture(256,256,ctx=>{
        ctx.fillStyle=ground;ctx.fillRect(0,0,256,256);
        for(const y of [10,20,29,223,232,242]) {
          ctx.fillStyle=selvedge;ctx.fillRect(0,y,256,y===20 || y===232?4:1.5);
        }
        for(let y=0;y<256;y+=3) {
          ctx.fillStyle="rgba(255,251,237,.28)";ctx.fillRect(0,y,256,1);
          ctx.fillStyle=yarn;ctx.globalAlpha=.45;
          for(let x=(y%2)*3;x<256;x+=6) ctx.fillRect(x,y,3,1);
          ctx.globalAlpha=1;
        }
        ctx.fillStyle="rgba(115,104,86,.11)";
        for(let x=0;x<256;x+=4) ctx.fillRect(x,0,1,256);
      });
      return new T.MeshStandardMaterial({map,roughness:.98,side:T.DoubleSide});
    }
    const textiles={
      sea:wovenCloth("#b4cbd0","#87a8ad","#eee7d6"),
      sage:wovenCloth("#b5c2a8","#93a78d","#eee7d5")
    };
    const soft=createSoftFurnishings({T,group,mesh,finish,paintedTexture,turned,beam,ellipsoid,cylinder,backPad,footprint});
    function layThrow(parent,x,width,path,surface,skew=0,fringeColor=null) {
      const curve=new T.CatmullRomCurve3(path.map(([z,y])=>new T.Vector3(0,y,z)));
      const geometry=new T.PlaneGeometry(1,1,24,26);
      const {position,uv}=geometry.attributes;
      for(let row=0;row<=26;row++) {
        const t=row/26, center=curve.getPointAt(t), tangent=curve.getTangentAt(t);
        for(let col=0;col<=24;col++) {
          const i=row*25+col, u=uv.getX(i), across=u-.5;
          const fold=width*(.021*Math.sin(u*20+t*2)+.009*Math.sin(u*37-t*3));
          const hem=width*.034*Math.sin(u*8+.7)*t**4;
          position.setXYZ(i,x+width*across*(.94+.09*t)+skew*t,
            center.y+tangent.z*fold+tangent.y*hem,center.z-tangent.y*fold+tangent.z*hem);
        }
      }
      geometry.computeVertexNormals();
      const cloth=mesh(parent,geometry,surface,0,0,0);
      if(fringeColor!==null) {
        const fringe=new T.InstancedMesh(new T.CylinderGeometry(.003,.006,1,6),finish("fabric",fringeColor),25);
        const pose=new T.Object3D();
        for(let col=0;col<=24;col++) {
          const length=.036+.012*Math.cos(col*2);
          pose.position.fromBufferAttribute(position,26*25+col);
          pose.position.y-=length*.46;pose.rotation.z=.22*Math.sin(col);pose.scale.y=length;
          pose.updateMatrix();fringe.setMatrixAt(col,pose.matrix);
        }
        fringe.castShadow=true;cloth.add(fringe);
      }
      return cloth;
    }
    function clothboundBook(parent,x,y,z,w,d,h,color,angle) {
      footprint(parent,x,y,z,w+.025,d+.025,angle);
      const cover=box(parent,x,y+h/2,z,w,h,d,finish("fabric",color));
      cover.rotation.y=angle;
      const pages=box(parent,x+.002*Math.cos(angle),y+h/2,z-.002*Math.sin(angle),
        w-.001,h*.68,d+.001,0xefe6d4);
      pages.rotation.y=angle;
    }
    const contactTexture=paintedTexture(128,128,ctx=>{
      // A rounded footprint keeps the occlusion under the corners of beds and cabinets.
      const pixels=ctx.createImageData(128,128);
      for(let y=0;y<128;y++) for(let x=0;x<128;x++) {
        const radius=(Math.abs((x-63.5)/63.5)**3+Math.abs((y-63.5)/63.5)**3)**(1/3);
        const fade=1-T.MathUtils.smoothstep(radius,.32,1);
        const i=4*(128*y+x);
        pixels.data[i]=63; pixels.data[i+1]=51; pixels.data[i+2]=46;
        pixels.data[i+3]=Math.round(114*fade);
      }
      ctx.putImageData(pixels,0,0);
    });
    const shadowMaterial=new T.MeshBasicMaterial({map:contactTexture,opacity:.50,transparent:true,depthWrite:false});
    const shadowPlane=new T.PlaneGeometry(1,1);
    function contact(parent,w,d,z=0) {
      const shadow=new T.Mesh(shadowPlane,shadowMaterial);
      shadow.rotation.x=-Math.PI/2; shadow.position.set(0,.002,z);
      shadow.scale.set(w,d,1); shadow.raycast=()=>{};
      parent.add(shadow);
      return shadow;
    }
    const printAtlas=textureLoader.load("assets/coastal-prints.jpg",invalidate);
    printAtlas.encoding=T.sRGBEncoding;
    const paper=new T.MeshStandardMaterial({map:printAtlas,roughness:.94});
    function framedPrint(parent,x,y,z,w,h,print) {
      const frame=group("海岸风景画",x,y,z,parent);
      cushion(frame,0,0,-.009,w,h,.061,finish("wood",0x9b7553),.007);
      box(frame,0,0,.023,w-.028,h-.028,.008,finish("wood",0xc7aa81));
      box(frame,0,0,.028,w-.047,h-.047,.004,0xf6ead6);
      const face=new T.PlaneGeometry(w-.075,h-.075);
      const uv=face.attributes.uv;
      for(let i=0;i<uv.count;i++) uv.setX(i,(print+.015+.97*uv.getX(i))/3);
      mesh(frame,face,paper,0,0,.031);
    }
    // Interior wall finishes follow the shell; both windows stay open through the wall.
    // Subtle roller stipple only modulates the finish; the existing wall colours carry the light.
    const paintSurface=new T.CanvasTexture(paintedCanvas(256,256,ctx=>{
      const pixels=ctx.createImageData(256,256), rand=seededRandom(917);
      for(let i=0;i<pixels.data.length;i+=4) {
        const fine=rand()+rand()-1;
        pixels.data[i]=128+fine*15;
        pixels.data[i+1]=242+fine*8;
        pixels.data[i+2]=128; pixels.data[i+3]=255;
      }
      ctx.putImageData(pixels,0,0);
    }));
    paintSurface.encoding=T.LinearEncoding;
    paintSurface.wrapS=paintSurface.wrapT=T.RepeatWrapping;
    function wallPaint(color,map=null) {
      return new T.MeshStandardMaterial({color,map,roughness:.96,roughnessMap:paintSurface,
        bumpMap:paintSurface,bumpScale:.00014});
    }
    function wallTexture(color,panelled) {
      return paintedTexture(1024,512,ctx=>{
        ctx.fillStyle=color; ctx.fillRect(0,0,1024,512);
        const roller=seededRandom(827);
        for(let i=0;i<95;i++) {
          const x=roller()*1024, y=roller()*512, radius=14+roller()*28;
          const wash=ctx.createRadialGradient(x,y,0,x,y,radius);
          wash.addColorStop(0,i%2?"rgba(255,249,235,.025)":"rgba(81,70,57,.023)");
          wash.addColorStop(1,"rgba(160,151,137,0)");
          ctx.fillStyle=wash;ctx.fillRect(x-radius,y-radius,2*radius,2*radius);
        }
        if(panelled) {
          const rand=seededRandom(611);
          for(let x=0;x<1024;x+=40) {
            ctx.fillStyle="rgba(127,98,71,"+(.012+rand()*.056)+")";
            ctx.fillRect(x,0,40,512);
            for(let i=0;i<11;i++) {
              const gx=x+3+rand()*34;
              ctx.strokeStyle="rgba(141,111,79,.064)";
              ctx.beginPath();ctx.moveTo(gx,0);ctx.bezierCurveTo(gx+2,148,gx-2,320,gx+.5,512);ctx.stroke();
            }
            ctx.fillStyle="rgba(117,93,69,.32)";ctx.fillRect(x,0,1.5,512);
            ctx.fillStyle="rgba(255,249,235,.50)";ctx.fillRect(x+1.5,0,1.5,512);
          }
        }
        const shade=ctx.createLinearGradient(0,0,0,512);
        shade.addColorStop(0,"rgba(58,48,38,.18)");shade.addColorStop(.19,"rgba(58,48,38,0)");
        shade.addColorStop(.87,"rgba(58,48,38,0)");shade.addColorStop(1,"rgba(58,48,38,.08)");
        ctx.fillStyle=shade;ctx.fillRect(0,0,1024,512);
      });
    }
    function sideLining(y0,y1,aperture,color,panelled) {
      const lip=skin*.025, start=back+skin+lip, end=front-lip, outline=new T.Shape();
      outline.moveTo(-start,y0); outline.lineTo(-end,y0); outline.lineTo(-end,y1); outline.lineTo(-start,y1); outline.closePath();
      const x=-aperture.centerZ,r=aperture.width/2+lip,hole=new T.Path();
      hole.moveTo(x-r,aperture.bottom-lip); hole.lineTo(x+r,aperture.bottom-lip);
      hole.lineTo(x+r,aperture.top+lip); hole.lineTo(x-r,aperture.top+lip); hole.closePath();
      outline.holes.push(hole);
      const face=new T.ShapeGeometry(outline), uv=face.attributes.uv, pos=face.attributes.position;
      for(let i=0;i<uv.count;i++) uv.setXY(i,(pos.getX(i)+end)/(end-start),(pos.getY(i)-y0)/(y1-y0));
      face.rotateY(Math.PI/2);
      const lining=mesh(house,face,wallPaint(0xffffff,wallTexture(color,panelled)),left+skin+.003,0,0);
      lining.castShadow=false;
    }
    sideLining(.15,story-.10,opening,"#e9dfcd",true);
    sideLining(walkingHeight,roofBase,upstairsWindow,"#abb2a0",false);
    const rearFace=back+skin;
    mesh(house,new T.PlaneGeometry(width-skin,roofBase-walkingHeight),
      wallPaint(0xffffff,wallTexture("#96a8ad",false)),skin/2,(roofBase+walkingHeight)/2,rearFace+.004);
    const archX=-1.60, archRadius=.49, archSpring=1.63;
    const accent=new T.Shape();
    accent.moveTo(left+skin,.15);accent.lineTo(archX-archRadius,.15);accent.lineTo(archX-archRadius,archSpring);
    accent.absarc(archX,archSpring,archRadius,Math.PI,0,true);
    accent.lineTo(archX+archRadius,.15);accent.lineTo(right,.15);accent.lineTo(right,story-.10);
    accent.lineTo(left+skin,story-.10);accent.closePath();
    const accentGeometry=new T.ExtrudeGeometry(accent,{depth:.095,bevelEnabled:false});
    const accentUV=accentGeometry.attributes.uv, accentPos=accentGeometry.attributes.position;
    for(let i=0;i<accentUV.count;i++)
      accentUV.setXY(i,(accentPos.getX(i)-left)/width,(accentPos.getY(i)-.15)/(story-.25));
    mesh(house,accentGeometry,wallPaint(0xffffff,wallTexture("#cdb0a3",false)),0,0,rearFace+.003);
    // Batch the skirting, corner mouldings and slab nosings into one draw.
    const trimPieces=[];
    const warmWhite=0xf1e4d1, shadowLine=0xb49b80;
    function trimRun(x,y,z,w,h,d,color=warmWhite) {
      trimPieces.push({x,y,z,w,h,d,color});
    }
    function skirting(x,z,w,d,y) {
      trimRun(x,y+.0525,z,w,.105,d);
      trimRun(x,y+.111,z,w+.002,.012,d+.002,0xf8edda);
    }
    const sideX=left+skin+.016, accentFace=rearFace+.098;
    // Narrow, one-sided fades on the receiving surface. Stop at the ends of each real joint.
    const seamPositions=[], seamColors=[], seamIndices=[];
    function joint(start,end,reach) {
      const a=new T.Vector3(...start), run=new T.Vector3(...end).sub(a), across=new T.Vector3(...reach);
      const endFade=Math.min(.12,across.length()/run.length()), first=seamPositions.length/3;
      for(const t of [0,endFade,1-endFade,1]) {
        for(const u of [0,.35,1]) {
          const p=a.clone().addScaledVector(run,t).addScaledVector(across,u);
          seamPositions.push(p.x,p.y,p.z);
          seamColors.push(.04,.033,.028,t===0 || t===1?0:.22*(1-u)**2);
        }
      }
      for(let row=0;row<3;row++) for(let col=0;col<2;col++) {
        const i=first+row*3+col;
        seamIndices.push(i,i+1,i+3,i+1,i+4,i+3);
      }
    }
    for(const [y,backEdge] of [[.15,accentFace],[walkingHeight,rearFace+.004]]) {
      skirting(sideX,(front+backEdge)/2,.025,front-backEdge,y);
      const ceiling=y===walkingHeight?roofBase:story-.10;
      const innerX=left+skin+.005, rearZ=backEdge+.002;
      joint([innerX,y+.002,rearZ],[innerX,y+.002,front-.008],[.11,0,0]);
      joint([innerX,ceiling-.002,rearZ],[innerX,ceiling-.002,front-.008],[0,-.095,0]);
      joint([innerX,ceiling-.002,rearZ],[right-.14,ceiling-.002,rearZ],[0,-.11,0]);
      joint([innerX,ceiling-.002,rearZ],[innerX,ceiling-.002,front-.008],[.085,0,0]);
      joint([innerX,ceiling-.002,rearZ],[right-.14,ceiling-.002,rearZ],[0,0,.085]);
      joint([innerX,y+.115,rearZ],[innerX,ceiling-.008,rearZ],[.08,0,0]);
      trimRun(sideX+.003,(y+.117+ceiling)/2,backEdge+.022,.032,ceiling-y-.117,.038);
    }
    function rearSkirting(x0,x1,z,y) {
      skirting((x0+x1)/2,z+.014,x1-x0,.028,y);
      joint([x0,y+.002,z+.027],[x1,y+.002,z+.027],[0,0,.085]);
    }
    // The recessed arch has two short returns and its own inset plinth.
    rearSkirting(left+skin+.029,archX-archRadius,accentFace,.15);
    rearSkirting(archX+archRadius,right,accentFace,.15);
    rearSkirting(archX-archRadius,archX+archRadius,rearFace+.004,.15);
    for(const x of [archX-archRadius+.012,archX+archRadius-.012])
      skirting(x,(accentFace+rearFace+.033)/2,.024,accentFace-rearFace-.033,.15);
    rearSkirting(left+skin+.029,right-.14,rearFace+.004,walkingHeight);
    skirting(right-.153,back+skin+.46,.026,.92,walkingHeight);
    joint([right-.168,walkingHeight+.002,rearFace],[right-.168,walkingHeight+.002,rearFace+.92],[-.08,0,0]);
    const seams=new T.BufferGeometry();
    seams.setAttribute("position",new T.Float32BufferAttribute(seamPositions,3));
    seams.setAttribute("color",new T.Float32BufferAttribute(seamColors,4));
    seams.setIndex(seamIndices);
    const joints=new T.Mesh(seams,new T.MeshBasicMaterial({vertexColors:true,transparent:true,
      side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    joints.name="墙板接缝遮蔽"; joints.raycast=()=>{}; house.add(joints);
    trimRun(right-.153,(walkingHeight+.117+roofBase)/2,rearFace+.024,.028,roofBase-walkingHeight-.117,.04);
    function nosing(x,z,w,d,y) {
      trimRun(x,y-.040,z,w,.046,d,0xf1dfc5);
      trimRun(x,y-.069,z,w,.011,d,shadowLine);
    }
    nosing(0,front,width,.012,.10);
    nosing(right,0,.012,depth,.10);
    for(const level of [1,2]) {
      const y=level*story-.10+slabThickness, start=level===1?left+skin:left;
      nosing((start+insideX)/2,front,insideX-start,.012,y);
      nosing(insideX,(front+insideZ)/2,.012,front-insideZ,y);
      nosing((insideX+right)/2,insideZ,right-insideX,.012,y);
      const rear=level===1?rearFace:back;
      nosing(right,(rear+insideZ)/2,.012,insideZ-rear,y);
    }
    const mouldings=new T.InstancedMesh(cube,new T.MeshStandardMaterial({roughness:.76}),trimPieces.length);
    const trimPose=new T.Object3D(), trimTint=new T.Color();
    trimPieces.forEach(({x,y,z,w,h,d,color},i)=>{
      trimPose.position.set(x,y,z);trimPose.scale.set(w,h,d);trimPose.updateMatrix();
      mouldings.setMatrixAt(i,trimPose.matrix);mouldings.setColorAt(i,trimTint.setHex(color));
    });
    mouldings.name="墙脚、转角与楼板封边";mouldings.receiveShadow=true;
    house.add(mouldings);
    const nicheLight=new T.PointLight(0xffbd72,.78,1.12,2);
    nicheLight.position.set(archX,2.02,rearFace+.16); house.add(nicheLight);
    framedPrint(house,archX,1.43,rearFace+.03,.41,.55,2);
    const lower=group("一楼客厅与厨房",0,.15,0,house);
    // This wall runs from the yard (+Z) into the room. Local +Z faces the aisle.
    const leftWall=group("一楼左墙家具",-width/2+.14,0,0,lower);
    leftWall.rotation.y=Math.PI/2;
    const sofa=group("沙发",-.83,0,.59,leftWall);
    sofa.scale.x=.81;
    contact(sofa,2.72,1.20);
    const upholstery=finish("fabric",0xf3e5ce), piping=finish("fabric",0xcab89d);
    const sofaOak=finish("wood",0xb98760);
    cushion(sofa,0,.175,0,2.30,.085,.88,sofaOak,.033);
    cushion(sofa,0,.295,0,2.42,.20,.95,piping,.070);
    cushion(sofa,0,.62,-.45,2.39,.65,.17,piping,.075).rotation.x=-.085;
    for(const side of [-1,1]) {
      const back=backPad(sofa,side*.52,.73,-.34,1.04,.57,.24,upholstery,-.16);
      back.rotateY(side*.028);
      seatPad(sofa,side*1.105,.505,.015,.24,.39,1.02,upholstery).rotation.x=-.08;
      seatPad(sofa,side*.51,.469,.07,1.016,.184,.79,upholstery);
      for(const z of [-.32,.32])
        groundedLeg(sofa,[side*1.01,.009,z*1.10],[side*.96,.165,z],.035,sofaOak,.052);
    }
    soft.pillow(sofa,-.69,.783,-.137,.615,.50,finish("fabric",0x91ac8e),.12);
    soft.pillow(sofa,.014,.744,-.105,.56,.37,soft.stripedLinen,-.045);
    soft.pillow(sofa,.695,.777,-.136,.55,.48,finish("fabric",0xdba47c),-.16);
    layThrow(sofa,.09,.62,[[-.18,.568],[.10,.569],[.35,.558],[.439,.541],[.493,.488],
      [.508,.37],[.535,.21],[.594,.093],[.659,.043],[.724,.042]],textiles.sea,-.108);
    const piano=group("钢琴",1.67,0,.31,leftWall);
    piano.scale.x=.94;
    const walnut=finish("wood",0x805b42), lacquer=finish("oiledWood",0x987354);
    const hardware=finish("brushed",0xd5b070);
    footprint(piano,0,0,0,1.39,.54);
    cushion(piano,0,.655,0,1.29,1.31,.44,lacquer,.024);
    box(piano,0,1.318,0,1.34,.024,.50,walnut);
    cushion(piano,0,1.36,0,1.39,.067,.56,lacquer,.019);
    for(const x of [-.588,.588]) cushion(piano,x,.62,.235,.069,1.10,.056,walnut,.012);
    cushion(piano,0,1.06,.23,1.15,.42,.035,finish("wood",0x916548));
    for(const x of [-.39,.39]) {
      box(piano,x,1.084,.251,.279,.285,.018,walnut);
      box(piano,x,1.084,.263,.254,.261,.013,lacquer);
    }
    box(piano,0,.865,.252,1.12,.012,.018,hardware);
    cushion(piano,0,.39,.228,1.10,.47,.038,finish("wood",0x79563f),.014);
    box(piano,0,.103,.248,1.18,.032,.07,walnut);
    box(piano,0,.073,.305,.35,.07,.13,walnut);
    const score=paintedTexture(256,128,ctx=>{
      ctx.fillStyle="#fff8e4"; ctx.fillRect(0,0,256,128);
      ctx.fillStyle="#716653";
      for(const left of [12,136]) for(let row=0;row<3;row++) {
        const y=18+row*33;
        for(let k=0;k<5;k++) ctx.fillRect(left,y+k*3,104,1);
        for(let k=0;k<9;k++) {
          const x=left+5+11*k, n=y+3*((k*3+row)%5);
          ctx.fillRect(x,n,4,3); ctx.fillRect(x+3,n-7,1,9);
        }
      }
    });
    const scorePage=new T.PlaneGeometry(.46,.216,12,2);
    const scorePos=scorePage.attributes.position;
    for(let i=0;i<scorePos.count;i++) {
      const x=scorePos.getX(i)/.23;
      scorePos.setZ(i,.014*Math.sin(Math.abs(x)*Math.PI)-.005*(1-Math.abs(x)));
    }
    scorePage.computeVertexNormals();
    const songbook=new T.Mesh(scorePage,new T.MeshStandardMaterial({map:score,roughness:.9}));
    songbook.rotation.x=-.19; songbook.position.set(0,1.075,.28); piano.add(songbook);
    box(piano,0,.965,.28,.5,.022,.10,walnut);
    box(piano,0,.74,.30,1.37,.09,.40,walnut);
    // One draw per key colour even with a full 88-key keyboard.
    const keyWidth=1.18/52;
    const naturals=new T.InstancedMesh(cube,finish("satin",0xfff6de),52);
    const sharps=new T.InstancedMesh(cube,finish("satin",0x353430),36);
    const keyPose=new T.Object3D();
    let raised=0;
    for(let i=0;i<52;i++) {
      const x=(i-25.5)*keyWidth;
      keyPose.position.set(x,.803,.357);keyPose.scale.set(keyWidth-.001,.034,.215);
      keyPose.updateMatrix();naturals.setMatrixAt(i,keyPose.matrix);
      // Starting at A0, there is no sharp after B or E, or beyond the last C.
      if(i<51 && i%7!==1 && i%7!==4) {
        keyPose.position.set(x+keyWidth*.5,.829,.322);keyPose.scale.set(keyWidth*.59,.033,.131);
        keyPose.updateMatrix();sharps.setMatrixAt(raised++,keyPose.matrix);
      }
    }
    for(const keys of [naturals,sharps]) {keys.castShadow=keys.receiveShadow=true;piano.add(keys);}
    cushion(piano,0,.868,.254,1.19,.10,.062,lacquer,.025).rotation.x=-.22;
    for(const x of [-.63,.63]) {
      cushion(piano,x,.81,.345,.084,.123,.325,walnut,.025);
      turned(piano,x,.074,.41,[[.051,0],[.045,.052],[.028,.12],[.027,.47],[.043,.61],[.057,.65]],walnut,14);
      cushion(piano,x,.054,.34,.103,.108,.27,walnut,.022);
      footprint(piano,x,0,.34,.17,.34);
    }
    for(const x of [-.087,0,.087]) {
      beam(piano,[x,.10,.254],[x,.067,.40],.012,hardware);
      ellipsoid(piano,x,.065,.395,.027,.014,.054,hardware);
    }
    cushion(piano,0,.385,.82,.66,.065,.32,walnut,.015);
    seatPad(piano,0,.444,.82,.69,.105,.35,finish("leather",0x605553));
    for(const x of [-.27,.27]) for(const z of [.72,.92])
      groundedLeg(piano,[x*1.05,.01,z],[x,.377,z],.023,walnut,.032);
    function houseplant(parent,x,y,z,size,potColor,leafColor,spread,supported=true) {
      const plant=group("盆栽",x,y,z,parent);
      plant.scale.setScalar(size);
      if(supported) footprint(plant,0,0,0,.26,.26);
      const glaze=finish("ceramic",potColor);
      cylinder(plant,0,.095,0,.13,.095,.19,glaze,20,.04);
      cylinder(plant,0,.183,0,.135,.13,.025,glaze,20,.04);
      cylinder(plant,0,.196,0,.117,.117,.012,0x5d5142,20);
      for(let i=0;i<11;i++) {
        const a=i*2.4, r=.09*spread*(1-i/16);
        const leaf=ellipsoid(plant,Math.cos(a)*r,.255+.006*i,Math.sin(a)*r,.036,.092/spread,.028,
          i%3===0?0x91a774:leafColor);
        leaf.rotation.z=-Math.cos(a)*spread*.73;
        leaf.rotation.x=Math.sin(a)*spread*.73;
      }
      return plant;
    }
    clothboundBook(piano,-.35,1.394,.036,.275,.188,.035,0xadc4c6,.09);
    houseplant(piano,.06,1.395,-.03,.86,0xc98b69,0x638e72,1.3);
    // A small sea-green ring vase leaves the music stand and keys clear.
    const ringVase=group("海青釉环形瓶",.46,1.394,.032,piano);
    footprint(ringVase,0,0,0,.18,.18);
    cylinder(ringVase,0,.015,0,.056,.068,.030,finish("ceramic",0x739c95));
    mesh(ringVase,new T.TorusGeometry(.083,.030,12,36),finish("ceramic",0x739c95),0,.111,0);
    cylinder(ringVase,-.024,.213,0,.032,.030,.037,finish("ceramic",0x739c95));
    framedPrint(leftWall,1.80,1.918,.045,.90,.51,1);
    const kitchen=group("厨房橱柜",2.63,0,-1.79,lower);
    kitchen.scale.x=.83;
    const olive=finish("satin",0x778f83), panelGreen=finish("satin",0xa1b6a5);
    const honey=finish("wood",0xc99766), bronze=finish("brushed",0xc4a072);
    beveledBox(kitchen,0,.465,-.02,3.36,.93,.83,olive);
    beveledBox(kitchen,0,.957,.012,3.39,.034,.88,finish("wood",0xa17c59));
    const worktop=finish("oiledWood",0xc99766);
    beveledBox(kitchen,0,1.021,0,3.48,.067,.94,worktop,.05);
    box(kitchen,0,.084,.39,3.26,.075,.037,finish("satin",0x61796e));
    for(const x of [-1.11,1.11]) {
      for(const dx of [-.26,.26]) {
        beveledBox(kitchen,x+dx,.50,.412,.49,.75,.045,panelGreen);
        beveledBox(kitchen,x+dx,.495,.438,.395,.615,.012,finish("satin",0x92a797));
        const pullX=x+dx-Math.sign(dx)*.16;
        for(const y of [.674,.765]) cylinder(kitchen,pullX,y,.454,.011,.011,.037,bronze,10).rotation.x=Math.PI/2;
        cylinder(kitchen,pullX,.72,.475,.012,.012,.113,bronze,12);
      }
    }
    // The hob and oven share a centre line with the extractor.
    box(kitchen,0,.50,.418,1.08,.80,.06,finish("brushed",0x514e43));
    box(kitchen,0,.47,.455,.92,.52,.022,finish("satin",0x353b37));
    box(kitchen,0,.72,.486,.83,.035,.055,finish("brushed",0xb6aa89));
    for(const x of [-.34,-.19,.20,.35]) ellipsoid(kitchen,x,.835,.46,.042,.042,.026,bronze);
    box(kitchen,0,1.067,.02,1.02,.025,.68,finish("brushed",0x424642));
    const steelGrate=finish("brushed",0x53554c);
    for(const x of [-.24,.24]) for(const z of [-.15,.15]) {
      cylinder(kitchen,x,1.09,z,.106,.11,.012,finish("brushed",0x736e5c),24);
      cylinder(kitchen,x,1.10,z,.078,.078,.015,finish("brushed",0x333731),24);
      for(const angle of [0,Math.PI/2]) box(kitchen,x,1.113,z,.24,.016,.015,steelGrate).rotation.y=angle;
    }
    const steel=finish("brushed",0xabb0ad);
    cushion(kitchen,0,2.15,-.34,.36,.34,.24,steel,.013);
    const hood=mesh(kitchen,new T.CylinderGeometry(1,2,.16,4),steel,0,2.02,-.18);
    hood.geometry.rotateY(Math.PI/4); hood.scale.set(.35,1,.176);
    cushion(kitchen,0,1.94,-.18,1.04,.044,.54,steel);
    for(let i=0;i<5;i++) box(kitchen,(i-2)*.134,1.952,.094,.103,.010,.009,finish("brushed",0x535b5b));
    beveledBox(kitchen,-1.09,1.99,-.29,1.08,.58,.43,olive);
    for(const x of [-1.36,-.82]) {
      beveledBox(kitchen,x,1.99,-.067,.514,.554,.037,panelGreen,.05);
      cushion(kitchen,x+(x<-1?.14:-.14),1.754,-.038,.12,.017,.029,bronze,.007);
    }
    function jar(x,y,z,r,h,color) {
      footprint(kitchen,x,y,z,r*2.45,r*2.45);
      cylinder(kitchen,x,y+h/2,z,r,r*.91,h,finish("ceramic",color),24);
      cylinder(kitchen,x,y+h+.012,z,r*1.03,r*1.03,.024,finish("wood",wood),24);
    }
    for(const y of [1.68,2.04]) {
      cushion(kitchen,1.1,y,-.33,1.12,.044,.34,honey,.011);
      for(const x of [.69,1.51]) beam(kitchen,[x,y-.105,-.345],[x,y-.023,-.196],.011,bronze);
    }
    houseplant(kitchen,.72,2.063,-.29,.67,0xd2ae87,0x617b49,.85);
    const glassJar=new T.MeshStandardMaterial({color:0x94b8b4,envMap:reflection,envMapIntensity:.33,
      transparent:true,opacity:.56,roughness:.16,depthWrite:false});
    for(const [x,r,h,fill] of [[1.065,.092,.217,0xbc9a67],[1.39,.099,.279,0x9c7760]]) {
      footprint(kitchen,x,2.062,-.262,r*2.25,r*2.25);
      turned(kitchen,x,2.063,-.262,[[0,0],[r*.85,0],[r,.015],[r,h-.045],[r*.82,h-.026],[r*.82,h]],glassJar);
      cylinder(kitchen,x,2.063+h*.27,-.262,r*.91,r*.83,h*.49,finish("satin",fill),28);
      mesh(kitchen,new T.TorusGeometry(r*.85,.007,6,28),glassJar,x,2.063+h-.012,-.262).rotation.x=Math.PI/2;
      cylinder(kitchen,x,2.063+h+.009,-.262,r*.96,r*.96,.023,honey,28);
    }
    for(const [i,color] of [0x75978c,0xe6c49f,0xf0e6d2].entries()) {
      turned(kitchen,.78,1.703+i*.039,-.270,[[.060,0],[.072,.012],[.137,.074],[.139,.090],
        [.128,.091],[.061,.027],[0,.022]],finish("ceramic",color));
    }
    soft.mug(kitchen,1.125,1.703,-.262,1.12,0x83aaa1,-.26);
    soft.mug(kitchen,1.445,1.703,-.254,1.24,0xdab48c,.27);
    beam(kitchen,[-.53,1.73,-.37],[.48,1.73,-.37],.016,bronze);
    for(const x of [-.35,-.02,.29]) {
      beam(kitchen,[x,1.72,-.365],[x,1.48,-.347],.014,walnut);
      ellipsoid(kitchen,x,1.44,-.34,.052,.073,.021,finish("brushed",0x73705c));
    }
    houseplant(kitchen,-1.46,1.055,-.18,.83,0xc49c6d,0x526f43,.74);
    const board=group("木质砧板",-1.06,1.055,-.14,kitchen);
    board.rotation.set(-.18,0,.075);
    cushion(board,0,.222,0,.373,.444,.038,finish("wood",0xb98451),.019);
    cushion(board,0,.457,0,.089,.121,.038,finish("wood",0xb98451),.018);
    footprint(kitchen,-.84,1.0545,.193,.18,.18);
    turned(kitchen,-.84,1.055,.193,[[0,0],[.068,0],[.111,.050],[.118,.096],
      [.107,.097],[.092,.053],[0,.022]],finish("ceramic",0x7c9f96));
    jar(-.75,1.055,-.06,.10,.18,cream);
    houseplant(kitchen,1.44,1.055,-.15,.64,linen,0x677f4a,1.2);
    // Four 12 cm tiles per repeat; account for the cabinet group's X scale.
    const tileMap=paintedTexture(256,256,ctx=>{
      ctx.fillStyle="#b9aa96";ctx.fillRect(0,0,256,256);
      const tones=["#eee2cf","#f0e4d2","#ecdfcb","#efe3d0"];
      for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
        const x=64*col,y=64*row;
        ctx.fillStyle=tones[(row*row+2*col+row*col)%4];ctx.fillRect(x+1,y+1,62.7,62.7);
        ctx.fillStyle="rgba(255,252,242,.36)";ctx.fillRect(x+1,y+1,62.7,1);
      }
    });
    const tileRelief=new T.CanvasTexture(paintedCanvas(256,256,ctx=>{
      ctx.fillStyle="#777";ctx.fillRect(0,0,256,256);ctx.fillStyle="#b5b5b5";
      for(let y=0;y<256;y+=64) for(let x=0;x<256;x+=64) ctx.fillRect(x+1,y+1,63,63);
    }));
    tileRelief.encoding=T.LinearEncoding;
    for(const texture of [tileMap,tileRelief]) {
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
      texture.repeat.set(3.49*kitchen.scale.x/.48,1.62/.48);
    }
    const tiles=new T.MeshStandardMaterial({map:tileMap,bumpMap:tileRelief,bumpScale:.0009,roughness:.54,envMap:reflection,envMapIntensity:.22});
    mesh(kitchen,new T.PlaneGeometry(3.49,1.62),tiles,0,1.83,-.36);
    const bar=group("厨房半岛吧台",3.78,0,-.91,lower);
    beveledBox(bar,0,1.028,0,.76,.069,1.50,worktop,.05);
    beveledBox(bar,-.02,.967,0,.62,.055,1.34,finish("wood",0xb78963));
    beveledBox(bar,-.09,.49,-.47,.51,.98,.38,olive);
    footprint(bar,-.09,0,-.47,.60,.47);
    for(const x of [-.27,.27]) cylinder(bar,x,.495,.66,.030,.026,.98,walnut,16);
    for(const z of [-.25,.39]) {
      const stool=group("吧椅",.23,0,z,bar);
      turned(stool,0,.588,0,[[0,0],[.157,0],[.181,.019],[.181,.034],[0,.034]],honey,24);
      seatPad(stool,0,.655,0,.39,.092,.36,finish("fabric",0xdac8ab));
      for(const x of [-.13,.13]) for(const dz of [-.12,.12])
        groundedLeg(stool,[x*1.22,.014,dz*1.22],[x*.86,.61,dz*.86],.022,honey,.031);
      for(const x of [-.15,.15]) beam(stool,[x,.23,-.14],[x,.23,.14],.012,bronze);
      beam(stool,[-.15,.23,.14],[.15,.23,.14],.013,bronze);
    }
    turned(bar,.08,1.064,.52,[[0,0],[.09,0],[.102,.007],[.104,.017],[.088,.012],[0,.012]],finish("wood",0xd4b38a),24);
    cylinder(bar,.08,1.124,.52,.056,.043,.088,finish("ceramic",0xfff7e8),24);
    cylinder(bar,.08,1.169,.52,.046,.046,.004,0x674836,24);
    const underCabinet=group("厨房柜下灯",0,0,0,kitchen);
    const kitchenFixture={root:underCabinet,emitters:[],intensity:1.40,emission:.92};
    for(const [x,y] of [[-1.09,1.69],[.02,1.90],[1.10,1.647]]) {
      const strip=box(underCabinet,x,y,-.20,.69,.012,.035,cream);
      strip.material=strip.material.clone();
      strip.material.emissive.setHex(0xffdda9);
      strip.material.emissiveIntensity=kitchenFixture.emission;
      const taskLight=new T.SpotLight(0xffe0bc,kitchenFixture.intensity,1.48,1.13,.95,1.5);
      taskLight.name="厨房近场暖光";
      taskLight.position.set(x,y-.024,-.085);
      taskLight.target.position.set(x,1.05,-.225);
      underCabinet.add(taskLight,taskLight.target);
      kitchenFixture.emitters.push({shade:strip,light:taskLight});
    }
    footprint(kitchen,0,0,-.02,3.49,.99);
    const fridge=group("冰箱",kitchen.position.x-1.74*kitchen.scale.x-.435-.018,0,kitchen.position.z+.075,lower);
    footprint(fridge,0,0,-.035,1.00,.88);
    beveledBox(fridge,0,.9725,-.035,.87,1.945,.77,finish("enamel",0xe4d3ad),.05);
    cushion(fridge,0,1.209,.357,.835,.031,.143,finish("satin",0x746e61),.012);
    for(const [y,height] of [[.613,1.165],[1.586,.724]]) {
      beveledBox(fridge,0,y,.344,.858,height,.175,finish("enamel",0xf0dfbe),.05);
    }
    for(const y of [1.10,1.31]) {
      for(const x of [-.30,-.07]) box(fridge,x,y,.453,.032,.035,.064,bronze);
      cushion(fridge,-.185,y,.485,.28,.028,.040,finish("brushed",0xb29a73),.013);
    }
    const note=box(fridge,.18,1.65,.44,.17,.21,.009,linen); note.rotation.z=-.13;
    for(const [x,y,c] of [[.17,1.73,0x85966a],[-.13,1.59,0xc87d57],[-.22,1.62,0x628f98]]) {
      ellipsoid(fridge,x,y,.452,.035,.030,.018,c);
    }
    houseplant(fridge,.08,1.945,.18,.91,0xd3ab84,0x577548,1.24);
    for(const dx of [-.06,.06]) {
      const vine=[[.08+dx,2.18,.18],[.13+dx,2.06,.31],[.17+dx,1.97,.40],
        [.19+dx,1.87,.45],[.15+dx,1.80+dx,.45]];
      for(let i=1;i<vine.length;i++) {
        beam(fridge,vine[i-1],vine[i],.006,0x647447);
        const [x,y,z]=vine[i];
        ellipsoid(fridge,x,y,z+.012,.026,.046,.016,0x718550).rotation.z=i%2?.55:-.55;
      }
    }
    const dining=group("饭桌",1.50,0,.90,lower);
    turned(dining,0,.814,0,[[0,-.049],[.525,-.049],[.565,-.034],[.581,-.018],
      [.581,-.0024],[.5786,0],[0,0]],honey,56);
    turned(dining,0,.085,0,[[.094,0],[.114,.09],[.073,.22],[.053,.49],
      [.067,.603],[.148,.653],[.186,.661],[.186,.68]],honey,28);
    for(let i=0;i<3;i++) {
      const a=i*2*Math.PI/3;
      footprint(dining,.35*Math.cos(a),0,.35*Math.sin(a),.14,.14);
      beam(dining,[.046*Math.cos(a),.25,.046*Math.sin(a)],[.35*Math.cos(a),.031,.35*Math.sin(a)],.050,honey,.031);
    }
    // A small asymmetric bouquet leaves the front of the tabletop free.
    const porcelain=finish("ceramic",0xfff7e5);
    const runner=group("条纹短桌旗",0,.815,0,dining);
    runner.rotation.y=.34;
    layThrow(runner,0,.279,[[-.61,-.11],[-.597,-.052],[-.571,-.008],[-.528,.007],
      [0,.008],[.52,.008],[.565,-.004],[.589,-.052],[.593,-.155]],soft.aquaKnit,.006);
    const vase=group("白瓷花瓶",-.065,.833,-.09,dining);
    vase.scale.setScalar(1.17);
    ellipsoid(vase,0,.087,0,.095,.095,.09,porcelain);
    cylinder(vase,0,.167,0,.046,.054,.085,porcelain,28);
    for(const [x,y,z] of [[-.10,.34,.03],[.06,.39,0],[-.02,.42,-.07],[.105,.32,.04],[-.04,.31,.095]]) {
      beam(vase,[0,.17,0],[x,y,z],.008,0x637751);
      ellipsoid(vase,x*.7+.03,.255,z*.7,.042,.022,.021,0x6b8756);
      for(let i=0;i<5;i++) {
        const a=i*2*Math.PI/5;
        ellipsoid(vase,x+.031*Math.cos(a),y+.022*Math.sin(a),z+.017*Math.sin(a),.031,.027,.025,x>0?0xe9ac86:0xffeccb);
      }
      ellipsoid(vase,x,y,z+.02,.019,.017,.014,0xdcaf61);
    }
    soft.mug(dining,-.35,.816,-.095,1.18,0x86aaa2,2.65);
    soft.mug(dining,.318,.816,.099,1.18,0xd39670,-.22);
    const votive=cylinder(dining,-.28,.861,.17,.050,.046,.083,0xe4b582,24);
    votive.material=votive.material.clone();
    votive.material.emissive.setHex(0xa85521);
    const flame=ellipsoid(dining,-.28,.922,.17,.014,.033,.014,cream);
    flame.material=new T.MeshBasicMaterial({color:0xffe5a8});
    const candlelight=new T.PointLight(0xffc078,.22,.81,2);
    candlelight.position.set(-.28,.96,.17); dining.add(candlelight);
    function diningChair(x,z,angle) {
      const c=group("木餐椅",x,0,z,dining); c.rotation.y=angle;
      cushion(c,0,.43,0,.46,.048,.42,honey);
      seatPad(c,0,.465,.008,.435,.066,.383,finish("fabric",0x91a89b));
      for(const dx of [-.17,.17]) for(const dz of [-.15,.15]) {
        groundedLeg(c,[dx*1.25,.018,dz*1.25],[dx,.417,dz],.024,honey,.030,.04);
      }
      for(const dx of [-.167,.167]) beam(c,[dx,.40,-.145],[dx*1.13,.795,-.206],.020,honey,.025,.04);
      const back=bentBack(c,0,.75,-.234,.493,.148,.038,.055,honey);
      back.rotation.x=-.13;
    }
    diningChair(-.71,.06,Math.PI*.46); diningChair(.69,-.08,-Math.PI*.49);
    soft.ovalRug(lower,"客厅椭圆编织地毯",-2.01,.92,2.04,2.72);
    const coffeeTable=soft.caneTable(lower,-1.89,.024,.81);
    footprint(coffeeTable,0,.010,0,.76,.76);
    clothboundBook(coffeeTable,.134,.333,-.080,.25,.180,.038,0x628984,-.28);
    soft.budVase(coffeeTable,-.130,.333,.087,.80,0xf0e1c7);
    const lamp=group("客厅台灯",-2.12,0,.38,leftWall);
    lamp.scale.x=.82;
    footprint(lamp,0,.608,0,.25,.25);
    turned(lamp,0,.608,0,[[0,-.058],[.263,-.058],[.298,-.034],[.30,-.009],[.294,0],[0,0]],finish("wood",wood));
    for(let i=0;i<3;i++) {
      const a=.45+i*2*Math.PI/3;
      groundedLeg(lamp,[.25*Math.cos(a),.012,.25*Math.sin(a)],[.19*Math.cos(a),.561,.19*Math.sin(a)],.019,finish("wood",trim),.030);
    }
    turned(lamp,0,.611,0,[[0,0],[.096,0],[.12,.014],[.113,.034],[.08,.049],[.054,.091],
      [.085,.137],[.080,.186],[.040,.233],[.025,.256]],finish("ceramic",0x9aa695));
    cylinder(lamp,0,.917,0,.018,.025,.107,finish("brushed",0xb89970));
    clothboundBook(lamp,-.145,.609,.12,.135,.093,.018,0xaabdb8,-.24);
    const shade=turned(lamp,0,1.119,0,[[.224,-.149],[.235,-.144],[.143,.148],[.135,.151],[.224,-.149]],finish("fabric",0xf2deba),48);
    lightLinenShade(shade);
    shade.material.emissiveIntensity=1.23;
    for(const [y,r] of [[.975,.234],[1.266,.141]]) cylinder(lamp,0,y,0,r,r,.012,finish("brushed",0xbfa078),40);
    const lamplight=new T.PointLight(0xffd4a9,1.42,2.05,1.85);
    lamplight.name="客厅台灯近场暖光";
    lamplight.position.set(.07,1.06,.055);
    lamp.add(lamplight);

    const casement=group("客厅海景窗",-opening.centerZ,opening.bottom-lower.position.y,0,leftWall);
    const wh=opening.top-opening.bottom, ww=opening.width;
    const fixedPane=new T.Mesh(new T.PlaneGeometry(ww-.065,wh-.065),paneGlass);
    fixedPane.name="客厅透明窗玻璃";
    fixedPane.position.set(0,wh/2,-.08); fixedPane.raycast=()=>{}; casement.add(fixedPane);
    for(const x of [-ww/2,ww/2]) beveledBox(casement,x,wh/2,-.045,.065,wh+.08,.20,trim,.025);
    beveledBox(casement,0,wh,-.045,ww+.06,.065,.20,trim,.025);
    beveledBox(casement,0,0,.024,ww+.17,.075,.32,wood,.025);
    for(const x of [-ww/6,ww/6]) box(casement,x,wh/2,-.06,.028,wh,.04,wood);
    houseplant(casement,-.63,.0375,.07,.58,linen,0x578259,.93);

    const coast=group("窗外远岸",-17.94,-.53,-10.18);
    coast.rotation.y=.90;
    ellipsoid(coast,-1.20,-.08,-3.9,1.78,.79,1.05,0x7d9ba4);
    ellipsoid(coast,1.53,-.09,-.25,1.55,1.13,.86,0x83966f);
    for(const [x,y,z,s] of [[.66,.70,-.05,.66],[.90,.86,-.14,.91],[1.20,.97,-.17,.79],
      [1.53,1.01,-.15,1.02],[1.81,.96,-.29,.83],[2.10,.88,-.30,.70]]) {
      cylinder(coast,x,y+.11*s,z,.024*s,.036*s,.29*s,trim,8);
      ellipsoid(coast,x,y+.34*s,z,.14*s,.33*s,.13*s,0x597d6a);
    }
    // Only distant scenery receives this treatment; shared foreground materials stay intact.
    const distantMaterials=new Map(),airTint=new T.Color(0xc7d5d8);
    coast.traverse(object=>{
      if(!object.isMesh) return;
      const source=object.material;
      if(!distantMaterials.has(source)) {
        const surface=source.clone();
        surface.color.lerp(airTint,.18);surface.roughness=1;
        distantMaterials.set(source,surface);
      }
      object.material=distantMaterials.get(source);
    });

    const hanging=houseplant(leftWall,.64,1.64,.20,.97,0xc28f68,0x507949,1,false);
    beam(hanging,[0,.57,-.2],[0,.57,0],.016,trim);
    for(const dx of [-.115,.115]) beam(hanging,[0,.57,0],[dx,.15,.04],.008,0xa5845d);
    for(let i=0;i<3;i++) {
      const x=(i-1)*.075, bottom=-.06-i*.055;
      beam(hanging,[x,.24,.06],[x+.035,bottom,.13],.009,0x597343);
      for(let j=0;j<4;j++) {
        const leaf=ellipsoid(hanging,x+(j%2?.04:-.018),.15+(bottom-.15)*j/3,.13,.033,.058,.018,0x648552);
        leaf.rotation.z=j%2?.53:-.55;
      }
    }
    const pendant=group("窗边挂灯",1.22,1.94,.19,leftWall);
    const brass=finish("brushed",0xbf975f);
    box(pendant,0,.20,-.17,.085,.16,.06,brass);
    beam(pendant,[0,.23,-.18],[0,.23,.025],.018,brass);
    beam(pendant,[0,.23,.025],[0,.135,.025],.013,brass);
    cylinder(pendant,0,.121,.025,.074,.128,.055,brass,24);
    const lanternGlass=cylinder(pendant,0,0,.025,.105,.093,.206,finish("ceramic",0xf7e7c6),24);
    lanternGlass.material=lanternGlass.material.clone();
    lanternGlass.material.emissive.setHex(0xffc36e);
    lanternGlass.material.emissiveIntensity=.9;
    cylinder(pendant,0,-.115,.025,.103,.081,.029,brass,24);
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2;
      beam(pendant,[.093*Math.cos(a),-.108,.025+.093*Math.sin(a)],
        [.107*Math.cos(a),.105,.025+.107*Math.sin(a)],.009,brass);
    }
    const pendantLight=new T.PointLight(0xffdbb4,1.48,2.25,1.7);
    pendantLight.position.set(.045,-.095,.205); pendant.add(pendantLight);

    const garden=group("庭院",0,.16,0);
    const pavers=[];
    const limestone=surfaceTexture([199,193,179],43,24);
    const slabTops=[0xeee7d8,0xe5e4dc,0xe9dfd6].map(color=>
      new T.MeshStandardMaterial({color,map:limestone,bumpMap:limestone,bumpScale:.018,roughness:.94}));
    const slabEdge=new T.MeshStandardMaterial({color:0xaca18e,map:limestone,roughness:1});
    const pathRandom=seededRandom(472);
    function stone(x,z,angle=0) {
      x+=(pathRandom()-.5)*.12;
      z+=(pathRandom()-.5)*.10;
      const stoneType=Math.floor(random()*slabTops.length);
      const yaw=angle+(random()-.5)*.46;
      const w=.29+groundRandom()*.13, d=.21+groundRandom()*.12;
      // Small corner breaks make each stone distinct while keeping a flat walking face.
      const outline=new T.Shape();
      outline.moveTo(-w+.046,-d);
      outline.lineTo(w-.07,-d+.012); outline.lineTo(w,-d+.055);
      outline.lineTo(w-.012,d-.032); outline.lineTo(w-.055,d);
      outline.lineTo(-w+.06,d-.014); outline.lineTo(-w,d-.087);
      outline.lineTo(-w+.009,-d+.049); outline.closePath();
      const geo=new T.ExtrudeGeometry(outline,{depth:.045+groundRandom()*.015,
        bevelThickness:.016,bevelSize:.018,bevelSegments:2});
      const uv=geo.attributes.uv, offsetX=groundRandom(),offsetY=groundRandom();
      for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*.82+offsetX,uv.getY(i)*.82+offsetY);
      geo.rotateX(-Math.PI/2);
      const tile=new T.Mesh(geo,[slabTops[stoneType],slabEdge]);
      const groundY=groundHeight(x,z),burial=.012+.010*pathRandom();
      tile.position.set(x,groundY-garden.position.y-burial,z); tile.rotation.y=yaw;
      tile.name="嵌草石板";
      tile.castShadow=tile.receiveShadow=true; garden.add(tile);
      pavers.push({x,z,w:w+.025,d:d+.025,cos:Math.cos(yaw),sin:Math.sin(yaw),groundY,burial});
    }
    [[-.96,1.81],[-.67,2.30,.26],[-.06,2.61,.84],[.85,2.63,1.10],[1.50,2.73,1.27],
      [-1.52,2.65,1.05],[-2.28,2.91,1.32],[-3.05,2.90,1.38],
      [1.99,2.92,-1.28],[2.76,2.61,-.96],[3.57,2.14,-.95],[4.37,1.47,-.72],
      [5.03,.50,-.50],[5.51,-.32,-.35],[5.72,-1.30,-.18]].forEach(args=>stone(...args));

    // Small, feathered soil crescents follow selected slab edges, not a continuous border.
    const soilPositions=[],soilColors=[],soilIndices=[],soilTone=new T.Color(0xc0b695);
    for(const i of [1,5,7,10,13]) {
      const p=pavers[i],start=soilPositions.length/3;
      for(let j=0;j<=8;j++) {
        const a=-.4+j*.22+i*.7;
        for(const outer of [false,true]) {
          const u=Math.cos(a)*(p.w+(outer?.10:.006));
          const v=Math.sin(a)*(p.d+(outer?.075:.006));
          const x=p.x+u*p.cos+v*p.sin,z=p.z-u*p.sin+v*p.cos;
          soilPositions.push(x,groundHeight(x,z)+.002,z);
          soilColors.push(soilTone.r,soilTone.g,soilTone.b,outer?0:.44);
        }
        if(j){const k=start+2*j;soilIndices.push(k-2,k,k-1,k-1,k,k+1);}
      }
    }
    const soilGeometry=new T.BufferGeometry();
    soilGeometry.setAttribute("position",new T.Float32BufferAttribute(soilPositions,3));
    soilGeometry.setAttribute("color",new T.Float32BufferAttribute(soilColors,4));
    soilGeometry.setIndex(soilIndices);soilGeometry.computeVertexNormals();
    const soil=new T.Mesh(soilGeometry,new T.MeshStandardMaterial({vertexColors:true,
      roughness:1,transparent:true,depthWrite:false,side:T.DoubleSide}));
    soil.name="石板边缘土色过渡";soil.receiveShadow=true;scene.add(soil);

    // Root and fence beds thin out into mown space along the walking route.
    const meadowRandom=seededRandom(731);
    const beds=[
      [-7.14,1.35,1.32,1.05,.96],[-3.55,4.02,1.82,.46,.95],[-5.05,3.62,.78,.64,.70],
      [4.85,-3.55,1.0,.83,.85],[5.97,-2.26,.72,.69,.66],[3.53,2.80,.68,.40,.48],
      [-7.77,.35,.55,.70,.68],[-5.55,3.55,.55,.34,.58],[4.46,2.05,.35,.30,.46],
      [-7.85,2.16,.42,.62,.66]
    ];
    const tuftVertices=[],tuftColors=[],bladeTone=new T.Color();
    for(let i=0;i<5;i++) {
      const angle=i*2.40+.38*meadowRandom(),dx=Math.cos(angle),dz=Math.sin(angle);
      const px=.026*dx,pz=.026*dz,w=.010+.009*meadowRandom();
      const lean=.028+.053*meadowRandom(),height=.055+.079*meadowRandom();
      tuftVertices.push(px-dz*w,0,pz+dx*w,px+dz*w,0,pz-dx*w,px+lean*dx,height,pz+lean*dz);
      for(const tone of [0xa1ab8c,0xbac3a6,0xf0edd4]){
        bladeTone.setHex(tone);tuftColors.push(bladeTone.r,bladeTone.g,bladeTone.b);
      }
    }
    const tuft=new T.BufferGeometry();
    tuft.setAttribute("position",new T.Float32BufferAttribute(tuftVertices,3));
    tuft.setAttribute("color",new T.Float32BufferAttribute(tuftColors,3));tuft.computeVertexNormals();
    const tufts=[],grassPose=new T.Object3D();
    for(const lawn of lawns) {
      const samples=Math.round(lawn.rx*lawn.rz*153);
      for(let i=0;i<samples;i++) {
        const a=meadowRandom()*2*Math.PI,edge=coastRadius(lawn,a),r=Math.sqrt(meadowRandom())*edge;
        const x=lawn.x+lawn.rx*r*Math.cos(a),z=lawn.z+lawn.rz*r*Math.sin(a);
        if(Math.abs(x-house.position.x)<width/2+.22 && Math.abs(z-house.position.z)<depth/2+.24) continue;
        if(Math.abs(x+4.3)<1.08 && Math.abs(z-2.23)<.62) continue;
        let pathClearance=1;
        for(const p of pavers){
          const dx=x-p.x,dz=z-p.z;
          const outsideX=Math.max(0,Math.abs(dx*p.cos-dz*p.sin)-p.w);
          const outsideZ=Math.max(0,Math.abs(dx*p.sin+dz*p.cos)-p.d);
          pathClearance=Math.min(pathClearance,Math.hypot(outsideX,outsideZ));
        }
        const pockets=.5+.25*Math.sin(3.3*x+1.6*z)+.25*Math.cos(4*z-.8*x);
        let density=.004; // Deliberate open lawn between planted pockets.
        for(const [cx,cz,rx,rz,weight] of beds){
          const dist=Math.hypot((x-cx)/rx,(z-cz)/rz);
          density=Math.max(density,weight*(1-T.MathUtils.smoothstep(dist,.24,1.45)));
        }
        const seam=pathClearance>.025 && pathClearance<.14 && pockets>.72;
        density=Math.max(density,seam?.24:0);
        density*=T.MathUtils.smoothstep(pathClearance,.018,.12)*(.24+.76*pockets*pockets);
        if(meadowRandom()>=density) continue;
        const medium=!seam && density>.24 && meadowRandom()<.36;
        tufts.push({x,z,size:seam?.40+.24*meadowRandom():.65+.55*meadowRandom(),
          height:medium?1.45+.40*meadowRandom():.65+.35*meadowRandom(),angle:meadowRandom()*Math.PI*2,
          color:[0xa3ad94,0xafb69a,0x9ca98f][Math.floor(meadowRandom()*3)]});
      }
    }
    // Local infill only: bench ends, a fence foot, bridge landing and three slab seams.
    const infill=seededRandom(7313);
    for(const [cx,cz,rx,rz,n] of [[-5.19,2.33,.16,.22,6],[-3.39,2.29,.13,.23,5],
      [-4.82,4.04,.16,.10,4],[5.27,-1.85,.13,.22,5],[-7.63,1.43,.18,.22,5]]) {
      for(let i=0;i<n;i++) {
        const a=infill()*2*Math.PI,r=Math.sqrt(infill());
        tufts.push({x:cx+rx*r*Math.cos(a),z:cz+rz*r*Math.sin(a),size:.40+.22*infill(),
          height:.65+.22*infill(),angle:a,color:0x9faa83});
      }
    }
    for(const index of [5,10,13]) {
      const p=pavers[index];
      for(let i=0;i<3;i++) {
        const u=(i-1)*p.w*.42,v=p.d+.045+infill()*.025;
        tufts.push({x:p.x+u*p.cos+v*p.sin,z:p.z-u*p.sin+v*p.cos,
          size:.36+.13*infill(),height:.62,angle:infill()*6.28,color:0xaeb58a});
      }
    }
    const lawnCover=new T.InstancedMesh(tuft,new T.MeshLambertMaterial({
      vertexColors:true,side:T.DoubleSide,emissive:0x20251a
    }),tufts.length);
    tufts.forEach(({x,z,size,height,angle,color},i)=>{
      grassPose.position.set(x,groundHeight(x,z)-.003,z);grassPose.rotation.set(.055*Math.sin(angle),angle,.045*Math.cos(angle));
      const compression=1-.70*swingWear(T,x,z);
      grassPose.scale.set(size,size*height*compression,size);grassPose.updateMatrix();
      lawnCover.setMatrixAt(i,grassPose.matrix);lawnCover.setColorAt(i,bladeTone.setHex(color));
    });
    lawnCover.receiveShadow=true;
    lawnCover.name="聚落式短草与中草";
    lawnCover.raycast=()=>{}; // Decorative blades have no pointer interaction.
    scene.add(lawnCover);
    outdoorGroundDetails({T,scene,groundHeight,seededRandom});
    const pathLights=group("庭院步道灯",0,0,0);
    const outdoorGlass = material(cream).clone();
    outdoorGlass.roughness=.28; outdoorGlass.flatShading=false;
    outdoorGlass.emissive.setHex(0xffcb82);
    function lampPost(x,z) {
      const lamp=group("庭院灯",x,.10,z,pathLights);
      lamp.scale.setScalar(.78);
      box(lamp,0,.40,0,.10,.8,.10,trim);
      box(lamp,0,.86,0,.30,.28,.3,cream).material = outdoorGlass;
      box(lamp,0,1.02,0,.4,.08,.4,wood);
      box(lamp,0,1.14,0,.25,.14,.25,trim);
    }
    [[-4.6,3.2],[1.96,3.27],[5.18,-1.56]].forEach(([x,z])=>lampPost(x,z));
    // A short white garden fence frames the hydrangea bed.
    const fence=group("花园围栏",-.82,.15,4.16);
    for(let i=0;i<12;i++) {
      const x=-4.4+i*.35;
      box(fence,x,.4,0,.075,.67,.075,chalk);
      const cap=mesh(fence,new T.ConeGeometry(.075,.14,4),chalk,x,.805,0);
      cap.rotation.y=Math.PI/4;
    }
    box(fence,-2.48,.68,0,4.05,.08,.1,chalk);
    box(fence,-2.48,.27,0,4.05,.07,.1,chalk);

    const flowerBeds=group("庭院花丛",0,.15,0);
    plantThrift(T,flowerBeds,seededRandom,lawns[0],groundHeight);

    const canopyMaterial=new T.MeshStandardMaterial({roughness:.93,flatShading:true});
    function gardenTree(x,z,scale) {
      const g=group("庭院绿树",x,0,z); g.scale.setScalar(scale);
      cylinder(g,0,1.5,0,.30,.42,3.0,0x987458,12);
      beam(g,[0,1.5,0],[-.55,3,.06],.16,0x987458,.08);
      beam(g,[.02,1.75,-.03],[.66,3.05,-.14],.14,0x987458,.07);
      beam(g,[-.18,2.20,.02],[-.88,3.14,.24],.095,0x987458,.035);
      beam(g,[.12,2.32,-.05],[.23,3.66,-.31],.09,0x987458,.033);
      const foliage=[0x98a58e,0xa4b19a,0xafb8a1];
      const leaves=new T.InstancedMesh(round,canopyMaterial,15);
      const leafPose=new T.Object3D(),tone=new T.Color(),rng=seededRandom(479);
      // Unequal, offset boughs leave a small window above the left-hand fork.
      const lobes=[[-.86,3.23,.20,.90],[.63,3.49,-.20,1.05],[-.18,3.91,-.32,.91],
        [.22,3.28,.46,.78],[-.59,3.63,-.35,.68]];
      for(let i=0;i<leaves.count;i++) {
        const [cx,cy,cz,weight]=lobes[i%lobes.length],a=rng()*Math.PI*2,r=.23*Math.sqrt(rng());
        leafPose.position.set(cx+r*Math.cos(a),cy+(rng()-.5)*.24,cz+r*Math.sin(a));
        leafPose.rotation.set((rng()-.5)*.49,a,(rng()-.5)*.68);
        const s=(.78+.42*rng())*weight;
        leafPose.scale.set((.58+.10*rng())*s,(.33+.12*rng())*s,(.45+.09*rng())*s);leafPose.updateMatrix();
        leaves.setMatrixAt(i,leafPose.matrix);leaves.setColorAt(i,tone.setHex(foliage[i%3]));
      }
      leaves.name="错落绿叶簇";leaves.castShadow=leaves.receiveShadow=true;g.add(leaves);
      return g;
    }
    const kitchenTree=gardenTree(4.85,-3.55,.66);

    // Grow each flowering bough from the trunk. Keep its crown outside the west wall.
    const cherry=group("樱花树",-7.14,.15,1.35);
    const blossomRandom=seededRandom(103), bark=0x89684f;
    const fork=[.07,1.82,-.03];
    cylinder(cherry,0,.21,0,.23,.38,.44,bark,14);
    beam(cherry,[0,.24,0],[-.08,1.14,.03],.25,bark,.19);
    beam(cherry,[-.08,1.12,.03],fork,.195,bark,.15);
    for(let i=0;i<5;i++) {
      const a=i*2*Math.PI/5;
      beam(cherry,[0,.22,0],[.51*Math.cos(a),.015,.51*Math.sin(a)],.13,bark,.034);
    }
    const clusters=[];
    const boughs=[[-.57,2.37,.12],[.54,2.50,.34],[.07,2.67,-.48]];
    for(const [i,joint] of boughs.entries()) {
      const base=[fork[0]-.05*i,fork[1]-.16*i,fork[2]+.025*i];
      beam(cherry,base,joint,.13-.01*i,bark,.073);
    }
    const tips=[[-1.27,2.88,.12,1.12,7],[-.88,3.17,.45,.78,4],[-.86,3.35,-.25,.96,6],
      [-.31,3.53,-.43,1.02,7],[.22,3.43,-.61,.76,4],[.65,3.15,-.32,.97,6],
      [.90,2.97,.25,.72,4],[.38,3.22,.55,1.02,7],[-.18,3.10,.28,.62,4]];
    for(const [x,y,z,size,puffs] of tips) {
      const joint=boughs.reduce((best,next)=>
        Math.hypot(x-next[0],z-next[2])<Math.hypot(x-best[0],z-best[2])?next:best);
      const elbow=[joint[0]*.45+x*.55+.09*(z-joint[2]),joint[1]+.40*(y-joint[1]),joint[2]*.4+z*.6];
      beam(cherry,joint,elbow,.069,bark,.037);
      beam(cherry,elbow,[x,y,z],.039,bark,.015);
      clusters.push({x,y,z,size,puffs});
    }
    // Shared geometry keeps the petal detail inexpensive when viewing the whole island.
    const bloomPalette=[0xd5b3b7,0xdfbfc0,0xead0cb,0xf2dfd6,0xe5c4c1];
    const flowersPerPuff=4;
    const blossomPuffs=new T.InstancedMesh(round,canopyMaterial,clusters.reduce((n,c)=>n+c.puffs,0));
    const outline=new T.Shape();
    for(let i=0;i<5;i++) {
      const a=i*2*Math.PI/5;
      const point=(angle,r)=>[r*Math.cos(angle),r*Math.sin(angle)];
      if(i===0) outline.moveTo(...point(a,.34));
      outline.quadraticCurveTo(...point(a+.15,1.18),...point(a+.63,.92));
      outline.quadraticCurveTo(...point(a+1.08,1.16),...point(a+2*Math.PI/5,.34));
    }
    outline.closePath();
    const petals=new T.InstancedMesh(new T.ShapeGeometry(outline,3),
      new T.MeshLambertMaterial({side:T.DoubleSide}),blossomPuffs.count*flowersPerPuff);
    const pose=new T.Object3D(), tint=new T.Color();
    const puffMatrix=new T.Matrix4(),puffNormal=new T.Matrix3(),faceNormal=new T.Vector3(),forward=new T.Vector3(0,0,1);
    let puffIndex=0;
    clusters.forEach(({x,y,z,size,puffs},index)=>{
      for(let i=0;i<puffs;i++,puffIndex++) {
        const a=i*2.4+index+.48*blossomRandom(),r=(.18+.17*blossomRandom())*Math.sqrt((i+.5)/puffs)*size;
        // Keep the previous 4.083 m crown ceiling while opening gaps between boughs.
        pose.position.set(x+Math.cos(a)*r,y+.019-.6*r*r+.10*Math.sin(a),z+.76*Math.sin(a)*r);
        pose.rotation.set(.3*Math.sin(a),a,.24*Math.cos(a));
        const s=(.78+.56*blossomRandom())*size;
        pose.scale.set(.33*s,.205*s,.255*s);pose.updateMatrix();
        puffMatrix.copy(pose.matrix);puffNormal.getNormalMatrix(puffMatrix);
        blossomPuffs.setMatrixAt(puffIndex,pose.matrix);
        blossomPuffs.setColorAt(puffIndex,tint.setHex(bloomPalette[(index+i)%4]));
        for(let j=0;j<flowersPerPuff;j++) {
          const angle=a+j*2.4, v=2*(j+.5)/flowersPerPuff-1, radius=Math.sqrt(1-v*v);
          faceNormal.set(radius*Math.cos(angle),v,radius*Math.sin(angle));
          pose.position.copy(faceNormal).multiplyScalar(.98).applyMatrix4(puffMatrix);
          pose.quaternion.setFromUnitVectors(forward,faceNormal.applyNormalMatrix(puffNormal));
          pose.rotateZ(blossomRandom()*Math.PI);
          pose.scale.setScalar(.041+.033*blossomRandom()); pose.updateMatrix();
          const flowerIndex=puffIndex*flowersPerPuff+j;
          petals.setMatrixAt(flowerIndex,pose.matrix);
          petals.setColorAt(flowerIndex,tint.setHex(bloomPalette[Math.floor(blossomRandom()*5)]));
        }
      }
    });
    blossomPuffs.castShadow=blossomPuffs.receiveShadow=true;
    blossomPuffs.name="不对称樱花簇";petals.name="稀疏花瓣点缀";
    petals.receiveShadow=true;
    cherry.add(blossomPuffs,petals);

    const swing=group("庭院秋千",0,0,0,cherry);
    beam(swing,fork,[.43,2.56,.68],.12,bark,.078);
    beam(swing,[.43,2.56,.68],[1.49,2.68,.68],.081,bark,.048);
    swingSuspension({T,swing,mesh,finish});
    const swingSeat=cushion(swing,.91,.70,.68,1.09,.075,.38,finish("wood",0xc39769),.014);
    swingSeat.name="倒角木纹秋千座板";
    const swingUV=swingSeat.geometry.attributes.uv;
    for(let i=0;i<swingUV.count;i++) swingUV.setXY(i,swingUV.getX(i)*1.7+.12,swingUV.getY(i)*.65+.14);
    for(const x of [.49,1.33]) cylinder(swing,x,.75,.68,.030,.038,.042,finish("metal",0x977a59));
    const gardenBench=group("前院长椅",-4.3,.16,2.23);
    const benchShadow=contact(gardenBench,1.78,.81);
    benchShadow.position.y=groundHeight(-4.3,2.23)-gardenBench.position.y+.003;
    for(const x of [-.59,.59]) for(const z of [-.19,.23])
      footprint(gardenBench,x,groundHeight(-4.3+x,2.23+z)-gardenBench.position.y,z,.15,.14);
    const teak=finish("wood",0xc08d61), iron=finish("metal",0x4d6062);
    const benchTones=[.97,1,.985].map(v=>{const m=teak.clone();m.color.multiplyScalar(v);return m;});
    let boardIndex=0;
    function benchBoard(x,y,z,w,h,d) {
      const i=boardIndex++,b=cushion(gardenBench,x,y,z,w,h,d,benchTones[i%3],.009);
      const uv=b.geometry.attributes.uv;
      for(let k=0;k<uv.count;k++) uv.setXY(k,uv.getX(k)*1.3+i*.07,uv.getY(k)*.68+i*.035);
      b.name="长椅细微色差木板";return b;
    }
    for(const z of [-.19,-.06,.07,.20]) benchBoard(0,.46,z,1.52,.052,.118);
    for(const y of [.65,.80,.95]) {
      benchBoard(0,y,-.24-(y-.65)*.18,1.5,.119,.046).rotation.x=-.18;
    }
    for(const x of [-.59,.59]) {
      for(const [z,topY,topZ] of [[.23,.43,.16],[-.19,1,-.32]]) {
        const groundY=groundHeight(-4.3+x,2.23+z)-gardenBench.position.y;
        const rise=.032*Math.abs(topZ-z)/Math.hypot(topZ-z,topY-groundY);
        beam(gardenBench,[x,groundY+rise-.001,z],[x,topY,topZ],.032,iron).name="贴地长椅脚";
      }
      beam(gardenBench,[x,.42,.21],[x,.42,-.26],.032,iron);
    }

    // Lantern House and the connected boardwalk are scale references in the island plan.
    const lighthouse=group("灯塔",10,.15,-5.9);
    lighthouse.scale.set(1,1.34,1);
    cylinder(lighthouse,0,1.0,0,.77,1.03,2.0,0xf3e9d9,16);
    cylinder(lighthouse,0,2.18,0,.62,.77,.42,0xe3d2b8,20);
    cylinder(lighthouse,0,2.5,0,.45,.45,.43,cream,20).material = outdoorGlass;
    cylinder(lighthouse,0,2.32,0,.58,.58,.085,trim,20);
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      cylinder(lighthouse,.46*Math.cos(a),2.56,.46*Math.sin(a),.028,.028,.45,trim,8);
    }
    cylinder(lighthouse,0,2.93,0,.04,.58,.37,0xc85544,18);
    box(lighthouse,0,1.26,.73,.27,.60,.05,0x9bad9a);
    const heart=new T.Shape(); heart.moveTo(0,.06); heart.bezierCurveTo(-.04,.17,-.22,.15,-.19,.04); heart.bezierCurveTo(-.18,-.03,-.06,-.13,0,-.18); heart.bezierCurveTo(.07,-.11,.18,-.04,.18,.04); heart.bezierCurveTo(.20,.16,.05,.18,0,.06);
    const badge=new T.Mesh(new T.ShapeGeometry(heart),new T.MeshBasicMaterial({color:0xd67765,side:T.DoubleSide}));
    badge.position.set(0,1.32,.89); lighthouse.add(badge);
    const pierTimber=finish("wood",0xb79e83),pileTimber=finish("wood",0xa18a70);
    const dampPile=pileTimber.clone();dampPile.vertexColors=true;
    function deck(name,start,end,width,railing) {
      const pier=group(name,start[0],.22,start[1]),dx=end[0]-start[0],dz=end[1]-start[1];
      pier.rotation.y=Math.atan2(dx,dz);
      const length=Math.hypot(dx,dz),count=Math.ceil(length/.214),step=length/count;
      pier.userData.walkway={width,length};
      const board=new T.RoundedBoxGeometry(width,.092,step-.012,1,.009);
      const boards=new T.InstancedMesh(board,pierTimber,count);
      boards.name="错缝倒角桥面木板";
      const grainOffset=Float32Array.from({length:count},(_,i)=>((i*13)%17)/17);
      board.setAttribute("grainOffset",new T.InstancedBufferAttribute(grainOffset,1));
      const deckFinish=pierTimber.clone();
      deckFinish.onBeforeCompile=shader=>{
        shader.vertexShader="attribute float grainOffset;\n"+shader.vertexShader.replace("#include <uv_vertex>",
          "#include <uv_vertex>\n vUv = vec2(vUv.x * .86 + grainOffset * .14, vUv.y * .70 + grainOffset * .30);");
      };
      boards.material=deckFinish;
      const nails=new T.InstancedMesh(new T.CylinderGeometry(.012,.012,.004,7),finish("brushed",0x7b7367),count*2);
      const pose=new T.Object3D(),tone=new T.Color();
      for(let i=0;i<count;i++) {
        const z=(i+.5)*step;
        pose.position.set(.011*Math.sin(i*4),0,z);pose.rotation.y=.006*Math.cos(i*5.1);
        pose.scale.set(1,1,.975+.025*(.5+.5*Math.sin(i*3.7)));
        pose.updateMatrix();boards.setMatrixAt(i,pose.matrix);
        boards.setColorAt(i,tone.setScalar(.86+.12*(.5+.5*Math.cos(i*2.4))));
        pose.scale.set(1,1,1);
        for(const side of [0,1]) {
          pose.position.set((side-.5)*width*.79,.047,z);pose.updateMatrix();nails.setMatrixAt(2*i+side,pose.matrix);
        }
      }
      boards.castShadow=boards.receiveShadow=true;pier.add(boards,nails);
      const spans=railing?Math.ceil(length/1.25):2;
      let mooringPost;
      for(const side of [-1,1]) {
        const x=side*width*.439;
        box(pier,x,-.116,length/2,.109,.143,length,pileTimber);
        for(let i=0;i<=spans;i++){
          const z=i*length/spans,height=railing?.70:i===0?.135:.33;
          const pile=pier.localToWorld(new T.Vector3(x,0,z));
          addRipple(pile.x,pile.z,.085,.49,.75);
          const support=cylinder(pier,x,(height-1.03)/2,z,.067,.088,height+1.03,pileTimber,12);
          weatherPile(T,support,coastalWaterLevel-pier.position.y,dampPile);
          cylinder(pier,x,height+.009,z,.070,.071,.019,pierTimber,12);
          if(!railing && i>0) {
            for(const y of [height-.086,height-.063])
              cylinder(pier,x,y,z,.072,.072,.018,finish("fabric",0x9c896d),16);
            if(i===1 && side===1) mooringPost=new T.Vector3(x,height-.072,z);
          }
        }
        if(railing)beam(pier,[x,.64,0],[x,.64,length],.036,pierTimber);
      }
      if(mooringPost) {
        pier.updateWorldMatrix(true,false);
        return {pier,bitt:pier.localToWorld(mooringPost)};
      }
    }
    deck("灯塔栈桥",[5.83,-2],[9.08,-5.05],1.03,true);
    const berth=deck("前院码头",[.32,2.83],[-1.48,5.04],1.18,false);
    const settledShore=settleDeckStones(T,scene,[berth.pier,scene.getObjectByName("灯塔栈桥")]);
    mooredDinghy({T,group,mesh,box,beam,finish,addRipple,footprint},berth);

    // The temporary balloon is removed, including its off-screen shadow casters.

    const camera = new T.OrthographicCamera(-1,1,1,-1,.1,1600);
    const home = { yaw:.86, pitch:.13, focus:new T.Vector3(-.85,3.68,-.20) };
    const lounge = { yaw:.88, pitch:.079, focus:new T.Vector3(-.76,1.57,-1.11) };
    const bedroom = { yaw:.68, pitch:.12, focus:new T.Vector3(-.90,4.50,-1.56) };
    const roof=group("屋顶陈设",0,roofBase+slabThickness,0,house);
    furnishTerrace({T,roof,front,group,mesh,box,cushion,seatPad,backPad,cylinder,beam,ellipsoid,houseplant,finish,footprint,textiles,layThrow,soft,clothboundBook});
    const upstairs=furnishUpstairs({T,house,left,back,skin,walkingHeight,opening:upstairsWindow,group,
      mesh,box,beveledBox,cushion,seatPad,backPad,bentBack,cylinder,beam,groundedLeg,ellipsoid,houseplant,paintedTexture,weave,finish,contact,footprint,framedPrint,printAtlas,paneGlass,layThrow,clothboundBook,turned,soft,lightLinenShade});
    // Batch the fixed contact points into one draw, retaining their hosts' rotation and scale.
    house.updateMatrixWorld(true);
    const houseInverse=house.matrixWorld.clone().invert(), stampPose=new T.Object3D();
    const contactInk=shadowMaterial.clone();
    contactInk.opacity=.86; contactInk.polygonOffset=true;
    contactInk.polygonOffsetFactor=-1; contactInk.polygonOffsetUnits=-1;
    const stamps=new T.InstancedMesh(shadowPlane,contactInk,footprints.length);
    footprints.forEach(({parent,x,y,z,w,d,angle},i)=>{
      parent.updateWorldMatrix(true,false);
      stampPose.rotation.set(-Math.PI/2,angle,0,"YXZ");
      stampPose.position.set(x,y+.001,z); stampPose.scale.set(w,d,1); stampPose.updateMatrix();
      stampPose.matrix.premultiply(parent.matrixWorld).premultiply(houseInverse);
      stamps.setMatrixAt(i,stampPose.matrix);
    });
    stamps.name="家具与摆件接触遮蔽"; stamps.raycast=()=>{}; house.add(stamps);
    // Small fittings still receive light and shadows. Keep the sun pass for silhouettes
    // that resolve at this map's texel size, including the instanced reeds and piano keys.
    house.updateMatrixWorld(true);
    const worldScale=new T.Vector3();
    house.traverse(object=>{
      if(!object.isMesh || !object.castShadow || object.isInstancedMesh) return;
      const geometry=object.geometry;
      if(!geometry.boundingSphere) geometry.computeBoundingSphere();
      worldScale.setFromMatrixScale(object.matrixWorld);
      const radius=geometry.boundingSphere.radius*Math.max(worldScale.x,worldScale.y,worldScale.z);
      if(radius<.082) object.castShadow=false;
    });
    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.needsUpdate=true;
    const focus = home.focus.clone();
    const action = document.getElementById("scene-action");
    const pendantAction = document.getElementById("pendant-action");
    const kitchenAction = document.getElementById("kitchen-action");
    const upperAction=document.getElementById("upper-action");
    const windowAction=document.getElementById("window-action");
    const tableFixture={root:lamp,emitters:[{shade,light:lamplight}],intensity:lamplight.intensity,emission:shade.material.emissiveIntensity};
    const wallFixture={root:pendant,emitters:[{shade:lanternGlass,light:pendantLight}],intensity:pendantLight.intensity,emission:lanternGlass.material.emissiveIntensity};
    const fixtures=[tableFixture,wallFixture,kitchenFixture];
    const label = document.getElementById("view-label");
    let view=home, framing=0, transition=null;
    let yaw = home.yaw, pitch = home.pitch, zoom = 1, scheduled = false;
    // Open on the daylight presentation; night remains an explicit user-controlled view.
    let night = false;
    let nightBlend = Number(night), skyTransition = null;
    const daynight = document.getElementById("daynight");
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const reflectiveMaterials=new Map();
    scene.traverse(object=>{
      if(!object.material) return;
      for(const surface of Array.isArray(object.material)?object.material:[object.material]) {
        if(surface.envMap===reflection) reflectiveMaterials.set(surface,surface.envMapIntensity);
      }
    });
    const environmentColors = [
      [hemi.color, 0xb7cbff], [hemi.groundColor, 0x777e9b], [sun.color, 0xc6d6ff],
      [scene.fog.color, 0x4b5a73], [sea.material.color, 0x8da8ce]
    ].map(([color,hex])=>({color,day:color.clone(),night:new T.Color(hex)}));

    function applyDaylight(blend) {
      nightBlend = blend;
      const reflectionScale=T.MathUtils.lerp(1,.10/.22,blend);
      for(const [surface,dayIntensity] of reflectiveMaterials) surface.envMapIntensity=dayIntensity*reflectionScale;
      backgroundCtx.drawImage(sky,0,0);
      if(blend > 0) {
        backgroundCtx.globalAlpha = blend;
        backgroundCtx.drawImage(nightSky,0,0);
        backgroundCtx.globalAlpha = 1;
      }
      scene.background.needsUpdate = true;
      for(const tint of environmentColors) tint.color.lerpColors(tint.day,tint.night,blend);
      hemi.intensity = T.MathUtils.lerp(skyFill,.48,blend);
      sun.intensity = T.MathUtils.lerp(daylightKey,.32,blend);
      outdoorGlass.emissiveIntensity = blend;
    }
    function updateDaynightButton() {
      document.body.classList.toggle("night",night);
      daynight.title = night ? "切换到白天" : "切换到夜晚";
      daynight.setAttribute("aria-checked",String(night));
      themeColor.content = night ? "#18253d" : "#d5dfde";
    }
    applyDaylight(nightBlend);
    updateDaynightButton();
    daynight.disabled = false;
    daynight.addEventListener("click",()=>{
      night = !night;
      updateDaynightButton();
      skyTransition = {start:performance.now(),from:nightBlend};
      invalidate();
    });
    const motionPreference=matchMedia("(prefers-reduced-motion: reduce)");
    let lastWaterFrame=null;
    function resumeWater() {
      lastWaterFrame=null;
      if(!document.hidden) invalidate();
    }
    document.addEventListener("visibilitychange",resumeWater);
    motionPreference.addEventListener("change",resumeWater);
    function render(now) {
      scheduled = false;
      const reducedMotion=motionPreference.matches;
      if(!reducedMotion && !document.hidden) {
        if(lastWaterFrame!==null) water.advance((now-lastWaterFrame)*.001);
        lastWaterFrame=now;
        invalidate();
      }
      if(upstairs.animateWindow(now,reducedMotion)) {
        renderer.shadowMap.needsUpdate=true;
        invalidate();
      }
      if(skyTransition) {
        const t = reducedMotion ? 1 : T.MathUtils.clamp((now-skyTransition.start)/520,0,1);
        applyDaylight(T.MathUtils.lerp(skyTransition.from,Number(night),t*t*(3-2*t)));
        if(t===1) skyTransition = null;
        else invalidate();
      }
      if (transition) {
        const t=T.MathUtils.clamp((now-transition.start)/transition.duration,0,1);
        const ease=t*t*(3-2*t), dest=view;
        framing=T.MathUtils.lerp(transition.framing,Number(view!==home),ease);
        focus.lerpVectors(transition.focus,dest.focus,ease);
        yaw=T.MathUtils.lerp(transition.yaw,dest.yaw,ease);
        pitch=T.MathUtils.lerp(transition.pitch,dest.pitch,ease);
        zoom=T.MathUtils.lerp(transition.zoom,1,ease);
        if(t===1) transition=null;
        else invalidate();
      }
      const aspect=canvas.clientWidth/canvas.clientHeight;
      // Fit the tent and shoreline vertically, and the main island horizontally on narrow screens.
      const islandHeight=Math.max(6.28,8.50/aspect);
      const loungeHeight=Math.max(1.8,4.85/aspect);
      const halfHeight=islandHeight*Math.pow(loungeHeight/islandHeight,framing);
      // At room scale the orthographic camera still sits 500 m away.
      scene.fog.near=T.MathUtils.lerp(508,514,framing);
      camera.left=-halfHeight*aspect; camera.right=halfHeight*aspect;
      camera.top=halfHeight; camera.bottom=-halfHeight;
      // Navigation can hide the garden furniture. Its cached shadows must follow it.
      const showFence=framing<.9 && zoom<=1.12;
      if(gardenBench.visible!==(framing<.9) || fence.visible!==showFence)
        renderer.shadowMap.needsUpdate=true;
      gardenBench.visible=framing<.9;
      fence.visible=showFence;
      pathLights.visible=framing<.9;
      kitchenTree.visible=flowerBeds.visible=framing<.9;
      horizon.normal.set(Math.sin(yaw),0,Math.cos(yaw));
      horizon.constant=T.MathUtils.lerp(20,33,framing);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      camera.position.set(
        Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), Math.cos(yaw)*Math.cos(pitch)
      ).multiplyScalar(500).add(focus);
      camera.lookAt(focus);
      renderer.render(scene,camera);
    }
    function invalidate() {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(render);
      }
    }
    function resize() {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
      renderer.setSize(width,height,false);
      invalidate();
    }
    function magnify(factor) {
      if(transition) return;
      zoom = T.MathUtils.clamp(zoom*factor,view!==home?.85:.36,view!==home?1.65:4.5);
      invalidate();
    }
    function rotate(dx,dy) {
      if(transition) return;
      yaw -= dx*.006;
      if(view!==home) yaw=T.MathUtils.clamp(yaw,view.yaw-.16,view.yaw+.16);
      pitch = T.MathUtils.clamp(pitch+dy*.005,view!==home?.03:.09,view!==home?.20:1.26);
      invalidate();
    }
    function updateAction() {
      const upper=view===bedroom;
      label.textContent=upper?"二楼卧室":view===lounge?"一楼客厅":"小屋全景";
      action.textContent=view===lounge?(lamplight.intensity?"关闭台灯":"打开台灯"):"走近客厅";
      action.hidden=upper;
      upperAction.hidden=view===lounge;
      upperAction.textContent=upper?(upstairs.bedside.emitters[0].light.intensity?"关闭床头灯":"打开床头灯"):"查看二楼";
      windowAction.hidden=!upper;
      windowAction.textContent=upstairs.windowLabel();
      pendantAction.hidden=view===home;
      pendantAction.textContent=upper?(upstairs.sconce.emitters[0].light.intensity?"关闭壁灯":"打开壁灯"):
        (pendantLight.intensity?"关闭挂灯":"打开挂灯");
      kitchenAction.hidden=view!==lounge;
      kitchenAction.textContent=kitchenFixture.emitters[0].light.intensity?"关闭厨房灯":"打开厨房灯";
    }
    function setView(dest) {
      view=dest;
      const startYaw=dest.yaw+Math.atan2(Math.sin(yaw-dest.yaw),Math.cos(yaw-dest.yaw));
      transition={start:performance.now(),duration:matchMedia("(prefers-reduced-motion: reduce)").matches?1:520,
        focus:focus.clone(),yaw:startYaw,pitch,zoom,framing};
      canvas.removeAttribute("data-actionable");
      updateAction();
      invalidate();
    }
    function reset() {
      if(view!==home || transition) {
        setView(home);
      } else {
        yaw=home.yaw; pitch=home.pitch; zoom=1;
        invalidate();
      }
    }
    function toggleLamp(fixture) {
      const on=fixture.emitters[0].light.intensity===0;
      for(const {shade,light} of fixture.emitters) {
        shade.material.emissiveIntensity=on?fixture.emission:0;
        light.intensity=on?fixture.intensity:0;
      }
      updateAction();
      invalidate();
    }
    function cycleWindow() {
      upstairs.advanceWindow();
      updateAction(); invalidate();
    }
    action.addEventListener("click",()=>view===lounge?toggleLamp(tableFixture):setView(lounge));
    upperAction.addEventListener("click",()=>view===bedroom?toggleLamp(upstairs.bedside):setView(bedroom));
    windowAction.addEventListener("click",cycleWindow);
    pendantAction.addEventListener("click",()=>toggleLamp(view===bedroom?upstairs.sconce:wallFixture));
    kitchenAction.addEventListener("click",()=>toggleLamp(kitchenFixture));

    const picker=new T.Raycaster();
    const coordinates=new T.Vector2();
    const roomBounds=new T.Box3().setFromCenterAndSize(
      new T.Vector3(house.position.x,ground+story,house.position.z),new T.Vector3(width+.1,2*story,depth+.1)
    );
    function pick(x,y) {
      if(transition) return false;
      const rect=canvas.getBoundingClientRect();
      coordinates.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
      picker.setFromCamera(coordinates,camera);
      picker.near=camera.near;
      if(!picker.ray.intersectsBox(roomBounds)) return false;
      const hit=picker.intersectObjects(scene.children,true).find(({object})=>{
        if(!object.isMesh) return false;
        for(let parent=object;parent;parent=parent.parent) {
          if(!parent.visible) return false;
        }
        return true;
      });
      if(!hit) return false;
      if(view!==home) {
        const lights=view===bedroom?[upstairs.bedside,upstairs.sconce]:fixtures;
        for(let node=hit.object;node && node!==house;node=node.parent) {
          if(view===bedroom && node===upstairs.windowRoot) return cycleWindow;
          const direct=lights.find(fixture=>node===fixture.root);
          if(direct) return direct;
        }
        // Enlarge the touch target when aiming at the visible wall behind a small lamp.
        if(hit.object.parent!==house && hit.object.parent!==kitchen) return false;
        return lights.find(fixture=>fixture.emitters.some(({shade})=>{
          const p=shade.getWorldPosition(new T.Vector3()).project(camera);
          return Math.hypot((p.x-coordinates.x)*rect.width/2,(p.y-coordinates.y)*rect.height/2)<22;
        }));
      }
      let obj=hit.object;
      while(obj && obj!==house) obj=obj.parent;
      if(!obj) return false;
      const local=house.worldToLocal(hit.point.clone());
      if(local.y<story-.10) return lounge;
      return local.y<roofBase?bedroom:false;
    }

    const pointers = new Map();
    let tap=null;
    function pinchSpan() {
      const [a,b] = pointers.values();
      return Math.hypot(a.x-b.x,a.y-b.y);
    }
    canvas.addEventListener("pointerdown",event=>{
      if (event.button !== 0 || pointers.size >= 2) return;
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      tap=pointers.size===1?{x:event.clientX,y:event.clientY}:null;
    });
    canvas.addEventListener("pointermove",event=>{
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        if(event.pointerType==="mouse") canvas.dataset.actionable=String(Boolean(pick(event.clientX,event.clientY)));
        return;
      }
      if(tap && Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<6) return;
      tap=null;
      const before = pointers.size === 2 ? pinchSpan() : 0;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if (pointers.size === 1) rotate(event.clientX-previous.x,event.clientY-previous.y);
      else if (before>0) magnify(pinchSpan()/before);
    });
    canvas.addEventListener("pointerup",event=>{
      if (pointers.has(event.pointerId) && tap && Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<6) {
        const target=pick(event.clientX,event.clientY);
        if(target===bedroom || target===lounge) setView(target);
        else if(target===cycleWindow) cycleWindow();
        else if(target) toggleLamp(target);
      }
      pointers.delete(event.pointerId);
      tap=null;
    });
    for (const type of ["pointercancel","lostpointercapture"]) {
      canvas.addEventListener(type,event=>{
        pointers.delete(event.pointerId);
        tap=null;
      });
    }
    canvas.addEventListener("wheel",event=>{
      event.preventDefault();
      magnify(Math.exp(-event.deltaY*.001));
    },{passive:false});
    canvas.addEventListener("keydown",event=>{
      switch(event.key) {
        case "ArrowLeft": rotate(-16,0); break;
        case "ArrowRight": rotate(16,0); break;
        case "ArrowUp": rotate(0,12); break;
        case "ArrowDown": rotate(0,-12); break;
        case "+": case "=": magnify(1.2); break;
        case "-": magnify(1/1.2); break;
        case "Home": reset(); break;
        default: return;
      }
      event.preventDefault();
    });
    document.getElementById("reset").addEventListener("click",reset);
    document.getElementById("in").addEventListener("click",()=>magnify(1.2));
    document.getElementById("out").addEventListener("click",()=>magnify(1/1.2));
    window.addEventListener("resize",resize);
    updateAction();
    resize();

  }
})();

