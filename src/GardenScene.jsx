import React, { Suspense, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, RoundedBox, useGLTF } from '@react-three/drei';
import { Box3, Shape, Vector3 } from 'three';

const plots = [[.45,.65],[1.6,.2],[.75,-.65],[2.45,1.05],[1.25,1.8],[2.1,-1],[-.25,-1.3],[-.3,2.4],[2.8,-.2]];

// Normalize source dimensions and pivots, sharing cached geometry and textures.
function NatureModel({ name, position=[0,0,0], size=1, width=false, rotation=0, castShadow=true }) {
  const { scene } = useGLTF(`/garden-assets/nature/${name}.gltf`);
  const model = useMemo(() => {
    const clone=scene.clone(true);
    const bounds=new Box3().setFromObject(clone);
    const extent=bounds.getSize(new Vector3());
    const center=bounds.getCenter(new Vector3());
    const factor=size/Math.max(width?Math.max(extent.x,extent.z):extent.y,.001);
    clone.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
    clone.scale.setScalar(factor);
    clone.traverse(node=>{if(node.isMesh){node.castShadow=castShadow;node.receiveShadow=true;}});
    return clone;
  },[scene,size,width,castShadow]);
  return <group position={position} rotation={[0,rotation,0]}><primitive object={model} dispose={null}/></group>;
}

// Let each asset appear as soon as it loads instead of blocking the whole garden.
function Nature(props) {
  return <Suspense fallback={null}><NatureModel {...props}/></Suspense>;
}

function Ground() {
  // Only shadows are rendered: the meadow in the backdrop is the visible ground.
  return <mesh rotation={[-Math.PI/2,0,0]} position={[0,.01,0]} receiveShadow>
    <planeGeometry args={[24,24]}/><shadowMaterial transparent opacity={.2} depthWrite={false}/>
  </mesh>;
}

function Bench() {
  return <group position={[-.15,.06,-2.35]} rotation={[0,-.12,0]}>
    {[-.45,.45].map(x=><mesh key={x} position={[x,.23,0]} castShadow><boxGeometry args={[.1,.46,.48]}/><meshStandardMaterial color="#6d6249"/></mesh>)}
    {[0,1,2].map(i=><RoundedBox key={i} args={[1.3,.08,.17]} radius={.025} position={[0,.47,(i-1)*.19]} castShadow><meshStandardMaterial color="#c39362"/></RoundedBox>)}
    {[.73,.96].map(y=><RoundedBox key={y} args={[1.3,.17,.07]} radius={.025} position={[0,y,-.27]} castShadow><meshStandardMaterial color="#bd8b5a"/></RoundedBox>)}
  </group>;
}

const pondOutline = new Shape();
for (let i=0;i<=32;i++) {
  const angle=i*Math.PI/16;
  const ripple=1+.055*Math.sin(angle*3)+.035*Math.cos(angle*7);
  const x=Math.cos(angle)*.86*ripple;
  const z=Math.sin(angle)*.57*ripple;
  if (i===0) pondOutline.moveTo(x,z);
  else pondOutline.lineTo(x,z);
}

function Pond() {
  const edgeStones=[[-.81,-.12],[-.58,.39],[-.18,.58],[.26,.51],[.68,.31],[.85,-.12],[.48,-.51],[-.37,-.54]];
  return <group position={[-1.48,.045,-.98]}>
    <mesh rotation={[-Math.PI/2,0,0]}>
      <shapeGeometry args={[pondOutline]}/>
      <meshBasicMaterial color="#67bec7" transparent opacity={.84} depthWrite={false}/>
    </mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.003,0]} scale={[.72,.71,1]}>
      <shapeGeometry args={[pondOutline]}/>
      <meshBasicMaterial color="#3799b3" transparent opacity={.42} depthWrite={false}/>
    </mesh>
    {edgeStones.map(([x,z],i)=><Nature key={`pond-stone-${i}`} name={i%2?'Pebble_Round_2':'Pebble_Round_4'} width size={.18+(i%3)*.025} position={[x,.018,z]} rotation={i*.8} castShadow={false}/>)}
    <Nature name="Plant_7" width size={.28} position={[-.68,.018,.43]} castShadow={false}/>
    <Nature name="Grass_Wispy_Tall" size={.25} position={[.72,.018,-.32]} castShadow={false}/>
  </group>;
}

function Planting({ object,index,selected,onSelect }) {
  const [x,z]=plots[index];
  const active=selected===object.id;
  const speciesModels={animals:'CommonTree_5',people:'Flower_3_Group',elderly:'CommonTree_3',ecology:'Bush_Common_Flowers',education:'CommonTree_5',donation:'Flower_4_Group',neighborhood:'Bush_Common_Flowers'};
  const plant=object.seed?'Plant_1':speciesModels[object.species]||'Flower_3_Group';
  const size=object.seed ? .6 : plant.startsWith('CommonTree') ? 1.35 : .72;
  return <group position={[x,.07,z]} onClick={event=>{event.stopPropagation();onSelect(object.id);}}>
    <Nature name={plant} size={size} position={[0,.05,0]} rotation={index*.83}/>
    {active&&<mesh position={[0,.035,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.44,.48,40]}/><meshBasicMaterial color="#f2cc78" transparent opacity={.7}/></mesh>}
    <mesh position={[0,.5,0]}><cylinderGeometry args={[.48,.48,1,12]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
    {active&&<Html center position={[0,size+.3,0]} style={{pointerEvents:'none'}}><span className="garden-plant-label">{object.seed?'Твой первый росток':'Растёт благодаря тебе'}</span></Html>}
  </group>;
}

// Every visit reveals part of the permanent landscape. The open pockets inside
// it belong to plants earned through real visits; keep routes and pond clear.
const trees = [
  ['CommonTree_1',-3.7,-3.8,2.7],['CommonTree_4',-2.35,-4.05,2.55],
  ['CommonTree_3',-.95,-4.2,2.45],['CommonTree_2',1.75,-4.15,2.65],
  ['Pine_2',3.75,-3.45,2.45],['CommonTree_5',-4.05,-1.45,1.85],
  ['Pine_3',4.1,-.95,2.05],['CommonTree_4',-4.15,1.5,1.45],
  ['CommonTree_5',-1.45,-5.35,1.8],['CommonTree_2',.75,-5.25,1.9],
  ['Pine_5',3,-5.15,1.75],
  ['CommonTree_3',-5.65,-3.45,2.05],['CommonTree_5',-1,-6.7,2.1],
  // Two small groves anchor the open left and rear portions of the meadow.
  ['CommonTree_2',-6.35,-4,2.05],['CommonTree_4',-6.2,-2.8,1.65],
  ['Pine_3',-5.2,-4.55,1.9],['CommonTree_1',-4.65,-3.25,2.2],
  ['CommonTree_1',-2.35,-6.45,2.2],['Pine_2',-1.75,-6.85,1.65],
  ['CommonTree_4',-.2,-6.9,2.25],['CommonTree_3',.65,-6.25,2],
  ['Pine_5',.95,-7.1,1.8],['CommonTree_5',1.65,-6.4,1.95],
];
const shrubs = [
  [-3.45,-2.65,.78],[-1.75,-3.45,.63],[.5,-3.5,.7],[2.95,-2.8,.72],
  [-3.9,-.25,.67],[3.8,.1,.72],[-3.85,2.65,.8],[3.8,2.45,.76],
  [-3.05,3.55,.58],[2.2,4.15,.68],[-2.45,-1.6,.57],[3.45,-1.55,.6],
  [-1.9,3.5,.62],[1.45,3.65,.56],[2.8,1.6,.57],[-2.75,1.2,.55],
  [-3.2,-4.7,.65],[-2.45,-5.1,.52],[-.3,-4.8,.58],
  [1.95,-4.9,.55],[3.35,-4.6,.67],
];
const flowers = [
  [-3.25,-3.15,.4],[-2.7,-2.8,.43],[-1.65,-3.05,.36],
  [.35,-3.1,.42],[1.4,-3.2,.38],[3.05,-2.45,.43],
  [-3.8,-1.15,.4],[-3.1,-.85,.35],[3.35,-.85,.42],[3.85,1.1,.36],
  [-3.75,.9,.37],[-3.2,1.85,.43],[3.25,1.75,.45],
  [-3.35,3.15,.4],[-2.45,3.55,.39],[-1.8,3.75,.32],
  [1.7,3.75,.38],[2.55,3.45,.42],[3.55,3.2,.36],
  [1.5,-1.55,.34],[-2.2,1.1,.32],
  [2.45,.55,.34],[-1.55,2.65,.29],[1.85,2.65,.31],
  [1.5,-.7,.39],[2,-.55,.31],[2.35,-.7,.28],
];
const undergrowth = [
  [-3.45,-1.8,'Fern_1',.55],[-2.95,.55,'Fern_1',.6],
  [3.45,-1.95,'Fern_1',.58],[3.55,.75,'Fern_1',.58],
  [-2.8,2.7,'Fern_1',.55],[2.65,2.95,'Fern_1',.54],
  [-2.55,-.6,'Plant_7',.48],[2.95,-.25,'Plant_7',.46],
  [-2.85,1.3,'Plant_7',.46],[2.9,2,'Plant_7',.5],
];
const rocks = [
  [-3.85,-2.1,'Rock_Medium_2',.52],[3.55,-2.1,'Rock_Medium_1',.49],
  [-3.75,.25,'Rock_Medium_3',.42],[3.85,1.55,'Rock_Medium_2',.53],
  [-3.1,3.8,'Rock_Medium_1',.42],[3.3,3.9,'Rock_Medium_3',.46],
];
const path = [
  [-1.05,5.45],[-.92,5.02],[-1,4.56],[-.95,4.1],[-.72,3.58],[-.87,3.06],[-.58,2.58],[-.77,2.08],
  [-.4,1.58],[-.42,1.07],[-.5,.57],[-.25,.05],[-.42,-.47],
  [-.2,-.99],
];
// A second route leaves the main walk across the lower meadow towards the
// bridge by the waterfall, instead of ending abruptly in the grass.
const bridgePath = [
  [-.22,2.32],[.45,2.55],[1.1,2.8],[1.78,3.06],[2.43,3.32],
  [3.05,3.58],[3.65,3.86],[4.25,4.18],[4.82,4.5],[5.35,4.84],
];
const meadowPatches = [
  [-2.8,-2.2],[-2.1,-2.45],[2.65,-2.15],[3.3,-1.2],
  [-3.3,-.35],[-2.55,.2],[3.2,.55],[3.65,1.7],
  [-3.45,1.8],[-2.9,2.25],[-2.25,3.15],[2.2,3.1],
  [3.45,2.85],[-1.9,3.85],[1.1,3.95],
  [-1.65,-1.95],[1.3,-2.55],[2.05,-.9],[-1.8,-.2],
  [2.4,.15],[-1.55,.85],[1.85,1.3],[-2.1,2.45],
  [1.15,2.65],[-.05,3.25],[2.85,2.35],[-.1,3.95],
];
const meadowAccents = [
  [-2.85,-2.45],[-1.9,-2.85],[2.4,-2.55],[3.25,-1.65],
  [-2.85,-.45],[2.7,-.3],[-3.15,1.65],[2.9,1.15],
  [-2.6,2.9],[-1.35,3.55],[.95,3.4],[2.35,3.65],
];
const treeStages = [
  1,2,3,1,4,2,3,4,2,3,5,4,3,
  2,4,5,3,2,4,3,5,4,5,
];
const revealAt = (index, offset = 0) => 1 + ((index * 3 + offset) % 5);

function Landscape({ stage }) {
  return <>
    {stage >= 3 && <Pond/>}
    {trees.map(([name,x,z,size],i)=>(i===0||i===3||treeStages[i]<=stage)&&<Nature key={`tree-${i}`} name={name} size={size} position={[x,.06,z]} rotation={i*1.17}/>)}
    {shrubs.map(([x,z,size],i)=>revealAt(i,1)<=stage&&<Nature key={`shrub-${i}`} name="Bush_Common_Flowers" size={size} position={[x,.06,z]} rotation={i*.84}/>)}
    {flowers.map(([x,z,size],i)=>revealAt(i,2)<=stage&&<Nature key={`flower-${i}`} name="Flower_4_Group" size={size} position={[x,.06,z]} rotation={i*1.4} castShadow={false}/>)}
    {undergrowth.map(([x,z,name,size],i)=>revealAt(i,3)<=stage&&<Nature key={`under-${i}`} name={name} width size={size} position={[x,.06,z]} rotation={i*1.31} castShadow={false}/>)}
    {rocks.map(([x,z,name,size],i)=>revealAt(i,4)<=stage&&<Nature key={`rock-${i}`} name={name} width size={size} position={[x,.06,z]} rotation={i*.71} castShadow={false}/>)}
    {meadowPatches.flatMap(([x,z],i)=>revealAt(i,1)<=stage ? [
      <Nature key={`clover-${i}`} name={i%2?'Clover_1':'Clover_2'} width size={.35+(i%3)*.04} position={[x,.06,z]} rotation={i*1.8} castShadow={false}/>,
      <Nature key={`grass-${i}`} name={i%3?'Grass_Wispy_Short':'Grass_Common_Tall'} size={.25+(i%4)*.025} position={[x+.32,.06,z-.18]} rotation={i*.9} castShadow={false}/>,
    ] : [])}
    {meadowAccents.flatMap(([x,z],i)=>revealAt(i,2)<=stage ? [
      <Nature key={`wildflower-${i}`} name="Flower_4_Single" size={.2+(i%3)*.025} position={[x,.06,z]} rotation={i*2.1} castShadow={false}/>,
      <Nature key={`wildgrass-${i}`} name={i%2?'Grass_Wispy_Tall':'Grass_Common_Short'} size={.18+(i%3)*.025} position={[x+.16,.06,z+.12]} rotation={i*.78} castShadow={false}/>,
      <Nature key={`pebble-${i}`} name={i%2?'Pebble_Round_2':'Pebble_Round_4'} width size={.16} position={[x-.16,.055,z-.1]} rotation={i*.65} castShadow={false}/>,
    ] : [])}
    {[[-3.5,.95],[-3.05,2.1],[3.25,-1.35],[3.7,2.15],[-2.95,3.3]].map(([x,z],i)=>revealAt(i,3)<=stage&&<Nature key={`mushroom-${i}`} name="Mushroom_Common" size={.25} position={[x,.06,z]} rotation={i} castShadow={false}/>)}
    {path.slice(0,Math.ceil(path.length*stage/5)).map(([x,z],i)=><Nature key={`path-${i}`} name={`RockPath_Round_Small_${i%3+1}`} width size={.64-(i*.012)} position={[x,.055,z]} rotation={i*.65} castShadow={false}/>)}
    {bridgePath.slice(0,Math.ceil(bridgePath.length*Math.max(0,stage-2)/3)).map(([x,z],i)=><Nature key={`bridge-path-${i}`} name={`RockPath_Round_Small_${(i+1)%3+1}`} width size={.58+(i*.018)} position={[x,.056,z]} rotation={i*.57} castShadow={false}/>)}
    {stage >= 2 && <Bench/>}
  </>;
}

function CameraFit() {
  const {camera,size}=useThree();
  useEffect(()=>{
    // Match the cover-scaled portrait backdrop; keep objects on its central clearing.
    const backdropWidth=Math.max(size.width,size.height*2/3);
    camera.zoom=Math.min(backdropWidth/15,size.width/9.8,size.height/9);
    camera.lookAt(0,0,0);
    camera.updateProjectionMatrix();
  },[camera,size]);
  return null;
}

export default function GardenScene({objects=[],stage=0,selected,onSelect}) {
  return <div className="garden-3d" data-stage={stage} aria-label={stage === 0 ? "Сад с двумя стартовыми деревьями" : "Интерактивный 3D-сад"}>
    <Canvas shadows orthographic gl={{alpha:true}} dpr={[1,1.5]} camera={{position:[5,10,11],near:.1,far:60}}>
      <hemisphereLight args={['#fff5dd','#a7b77b',2.6]}/>
      <directionalLight position={[-3,8,-4]} intensity={1.7} color="#fff1d4" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.04} shadow-radius={4}/>
      <CameraFit/>
      <Suspense fallback={<Html center><span className="garden-plant-label">Высаживаем сад…</span></Html>}>
        <Ground/><Landscape stage={stage}/>
        {objects.slice(0,9).map((object,index)=><Planting key={object.id} object={object} index={index} selected={selected} onSelect={onSelect}/>)}
      </Suspense>
    </Canvas>
  </div>;
}
