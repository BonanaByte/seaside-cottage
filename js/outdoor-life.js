/* Step 7.3: static, small-scale signs of use. No animation or lighting changes. */
function swingWear(T,x,z) {
  return 1-T.MathUtils.smoothstep(Math.hypot((x+6.23)/.57,(z-2.03)/.83),.30,1);
}

function outdoorGroundDetails({T,scene,groundHeight,seededRandom}) {
  const rng=seededRandom(7303),pose=new T.Object3D();
  // A single feathered mesh covers two worn patches; sample each ring onto the turf.
  const positions=[],colors=[],indices=[],tone=new T.Color(0xc0b695);
  for(const [cx,cz,rx,rz,alpha] of [[-6.23,2.03,.55,.80,.25],[5.63,-1.73,.39,.31,.22]]) {
    const segments=24;
    for(const radius of [0,.48,1]) for(let i=0;i<=segments;i++) {
      const a=i/segments*2*Math.PI,edge=1+.055*Math.sin(a*3)+.035*Math.cos(a*5);
      const x=cx+Math.cos(a)*rx*radius*edge,z=cz+Math.sin(a)*rz*radius*edge;
      positions.push(x,groundHeight(x,z)+.0025,z);
      colors.push(tone.r,tone.g,tone.b,radius===1?0:alpha*(1-.4*radius));
      if(radius>0 && i>0){const k=positions.length/3-1;indices.push(k-26,k-1,k,k-26,k,k-25);}
    }
  }
  const wornGeo=new T.BufferGeometry();
  wornGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  wornGeo.setAttribute('color',new T.Float32BufferAttribute(colors,4));
  wornGeo.setIndex(indices);wornGeo.computeVertexNormals();
  const worn=new T.Mesh(wornGeo,new T.MeshStandardMaterial({vertexColors:true,transparent:true,
    depthWrite:false,roughness:1,side:T.DoubleSide}));
  worn.name='秋千压草与桥头土色';worn.receiveShadow=true;scene.add(worn);

  const pebbles=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),
    new T.MeshStandardMaterial({roughness:1}),9);
  for(let i=0;i<9;i++) {
    const a=2.4*i+.3,r=.45+.28*rng(),x=-7.14+Math.cos(a)*r,z=1.35+Math.sin(a)*r;
    const s=.024+.026*rng();
    pose.position.set(x,groundHeight(x,z)+s*.16,z);
    pose.rotation.set(.16*rng(),a,.12*rng());pose.scale.set(s*1.3,s*.52,s);pose.updateMatrix();
    pebbles.setMatrixAt(i,pose.matrix);pebbles.setColorAt(i,new T.Color(i%2?0xc9bcaa:0xd2c8b3));
  }
  pebbles.name='树根细石';pebbles.castShadow=pebbles.receiveShadow=true;scene.add(pebbles);

  const petalGeo=new T.SphereGeometry(1,5,3);
  const petals=new T.InstancedMesh(petalGeo,new T.MeshStandardMaterial({color:0xdfbfc0,roughness:.94}),11);
  const up=new T.Vector3(0,1,0),normal=new T.Vector3(),delta=.02;
  for(let i=0;i<petals.count;i++) {
    const a=rng()*Math.PI*2,r=.43+.43*rng(),x=-7.14+Math.cos(a)*r,z=1.35+Math.sin(a)*r;
    normal.set(groundHeight(x-delta,z)-groundHeight(x+delta,z),2*delta,
      groundHeight(x,z-delta)-groundHeight(x,z+delta)).normalize();
    pose.position.set(x,groundHeight(x,z)+.003,z);pose.quaternion.setFromUnitVectors(up,normal);
    pose.rotateY(a);const s=.011+.008*rng();pose.scale.set(s,.0025,s*1.55);pose.updateMatrix();
    petals.setMatrixAt(i,pose.matrix);
  }
  petals.name='树根十一片落樱';petals.castShadow=petals.receiveShadow=true;scene.add(petals);
}

function swingSuspension({T,swing,mesh,finish}) {
  const rope=finish('fabric',0xa48d6e),paths=[];
  for(const x of [.49,1.33]) {
    const y=2.56+(x-.43)*.113;
    // Two snug turns encircle the existing branch; the tail leads down to the eye.
    const radius=.088-(x-.49)*.025,points=[];
    for(let i=0;i<=32;i++) {
      const a=i/32*4*Math.PI;
      points.push(new T.Vector3(x-.018+i/32*.036,y+Math.cos(a)*radius,.68+Math.sin(a)*radius));
    }
    paths.push(new T.CatmullRomCurve3(points));
    paths.push(new T.CatmullRomCurve3([points[32],new T.Vector3(x,y-.10,.715),
      new T.Vector3(x+.009,1.55,.689),new T.Vector3(x,.76,.68)]));
    const eye=mesh(swing,new T.TorusGeometry(.026,.007,5,10),finish('metal',0x977a59),x,.772,.68);
    eye.name='秋千座板绳眼';
    const knot=new T.CatmullRomCurve3([new T.Vector3(x,.805,.68),new T.Vector3(x+.022,.792,.70),
      new T.Vector3(x,.765,.70),new T.Vector3(x-.018,.792,.69),new T.Vector3(x,.81,.68)]);
    paths.push(knot);
  }
  // Merge all rope sections into one draw using the same fabric material.
  const coords=[],normals=[],uvs=[];
  for(const curve of paths) {
    const g=new T.TubeGeometry(curve,curve.points.length>20?40:16,.012,5,false).toNonIndexed();
    coords.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);uvs.push(...g.attributes.uv.array);g.dispose();
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(coords,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  mesh(swing,geometry,rope,0,0,0).name='秋千绕枝绳与绳结';
}

function weatherPile(T,pile,waterLocal,material) {
  const p=pile.geometry.parameters;
  const geometry=new T.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,p.radialSegments,4);
  const vertex=geometry.attributes.position,half=p.height/2;
  const levels=[half,waterLocal-pile.position.y+.16,waterLocal-pile.position.y+.04,
    waterLocal-pile.position.y-.035,-half];
  for(let i=0;i<vertex.count;i++) {
    const oldY=vertex.getY(i),row=Math.round((half-oldY)/p.height*4);
    const y=T.MathUtils.clamp(levels[row],-half,half);
    const oldRadius=T.MathUtils.lerp(p.radiusBottom,p.radiusTop,(oldY+half)/p.height);
    const radius=T.MathUtils.lerp(p.radiusBottom,p.radiusTop,(y+half)/p.height);
    vertex.setXYZ(i,vertex.getX(i)*radius/oldRadius,y,vertex.getZ(i)*radius/oldRadius);
  }
  geometry.computeVertexNormals();
  const colors=[],tone=new T.Color();
  for(let i=0;i<geometry.attributes.position.count;i++) {
    const y=geometry.attributes.position.getY(i)+pile.position.y;
    const dry=T.MathUtils.smoothstep(y,waterLocal-.035,waterLocal+.16);
    tone.setRGB(.78+.22*dry,.81+.19*dry,.81+.19*dry);colors.push(tone.r,tone.g,tone.b);
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  pile.geometry.dispose();pile.geometry=geometry;pile.material=material;pile.name='水线渐深木桩';
}

function settleDeckStones(T,scene,piers) {
  const world=new T.Matrix4(),instance=new T.Matrix4(),point=new T.Vector3();
  const local=new T.Vector3(),changed=[];
  scene.updateMatrixWorld(true);
  const decks=piers.map(pier=>({...pier.userData.walkway,inverse:pier.matrixWorld.clone().invert()}));
  for(const name of ['海岸大型岩簇','海岸中型散石','浅水小型散石']) {
    const stones=scene.getObjectByName('主岛').getObjectByName(name),pos=stones.geometry.attributes.position;
    for(let i=0;i<stones.count;i++) {
      stones.getMatrixAt(i,instance);world.multiplyMatrices(stones.matrixWorld,instance);
      let lower=0;
      for(let v=0;v<pos.count;v++) {
        point.fromBufferAttribute(pos,v).applyMatrix4(world);
        for(const {width,length,inverse} of decks) {
          local.copy(point).applyMatrix4(inverse);
          if(Math.abs(local.x)<width/2+.025 && local.z>-.025 && local.z<length+.025)
            lower=Math.max(lower,local.y+.061);
        }
      }
      if(lower>0) {
        instance.elements[13]-=lower;stones.setMatrixAt(i,instance);
        changed.push({name,index:i,lower});
      }
    }
    stones.instanceMatrix.needsUpdate=true;
  }
  return changed;
}
