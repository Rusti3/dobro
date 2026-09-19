import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Float, OrbitControls, RoundedBox, Sparkles } from '@react-three/drei';

const palette = {
  grass: '#98b873',
  deepGrass: '#63885c',
  soil: '#a47b58',
  wood: '#9a704c',
  blossom: '#eaa0a7',
  water: '#78b9c1',
  sand: '#d8c59b',
};
const plantColors = { animals: '#5f8b62', people: '#d58e85', elderly: '#8fa568', ecology: '#6f9b66', education: '#6f9890', donation: '#bd6d65', neighborhood: '#ad8965' };
const plotPositions = [[-2.55, 1.55], [-2.7, -.65], [-1.3, -2.05], [1.05, -2.15], [2.55, -.75], [2.35, 1.35], [0, 2.35], [0, -2.55], [3, .5]];

function Tree({ position = [0, 0, 0], scale = 1, blossom = false }) {
  return <group position={position} scale={scale}>
    <mesh position={[0, .55, 0]} castShadow><cylinderGeometry args={[.11, .16, 1.2, 8]} /><meshStandardMaterial color="#74523c" roughness={.9} /></mesh>
    <mesh position={[-.18, .8, 0]} rotation={[0, 0, -.5]} castShadow><cylinderGeometry args={[.055, .07, .65, 7]} /><meshStandardMaterial color="#74523c" /></mesh>
    <mesh position={[.2, .88, .02]} rotation={[0, 0, .48]} castShadow><cylinderGeometry args={[.05, .065, .7, 7]} /><meshStandardMaterial color="#74523c" /></mesh>
    <mesh position={[0, 1.2, 0]} castShadow><icosahedronGeometry args={[.62, 1]} /><meshStandardMaterial color={blossom ? '#d98897' : palette.deepGrass} roughness={.82} /></mesh>
    {blossom && [[-.32, 1.45, .25], [.32, 1.35, .2], [0, 1.62, -.15], [.44, 1.05, .12], [-.42, 1.08, .1]].map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[.1, 10, 8]} /><meshStandardMaterial color={i % 2 ? '#f1b2b5' : '#e8929f'} /></mesh>)}
  </group>;
}

function FlowerPatch({ position = [0, 0, 0], color = palette.blossom, count = 7 }) {
  const points = useMemo(() => Array.from({ length: count }, (_, i) => [((i * 17) % 9 - 4) * .09, 0, ((i * 11) % 7 - 3) * .08]), [count]);
  return <group position={position}>{points.map((p, i) => <group key={i} position={p}>
    <mesh position={[0, .18, 0]}><cylinderGeometry args={[.012, .018, .35, 5]} /><meshStandardMaterial color="#56805b" /></mesh>
    <mesh position={[0, .38, 0]}><sphereGeometry args={[.08, 8, 6]} /><meshStandardMaterial color={i % 3 === 0 ? '#f4c77a' : color} /></mesh>
  </group>)}</group>;
}

function Bush({ position = [0, 0, 0], color = '#6e985f' }) {
  return <group position={position}><mesh position={[-.2, .22, 0]} castShadow><sphereGeometry args={[.3, 10, 8]} /><meshStandardMaterial color={color} /></mesh><mesh position={[.17, .25, .03]} castShadow><sphereGeometry args={[.35, 10, 8]} /><meshStandardMaterial color={color} /></mesh><mesh position={[0, .4, -.03]} castShadow><sphereGeometry args={[.31, 10, 8]} /><meshStandardMaterial color="#86aa6d" /></mesh></group>;
}

function Bridge() {
  return <group position={[.6, .15, .2]} rotation={[0, -.25, -.04]}>
    {Array.from({ length: 7 }, (_, i) => <RoundedBox key={i} args={[.24, .08, 1.7]} radius={.025} position={[(i - 3) * .25, 0, 0]}><meshStandardMaterial color={i % 2 ? '#b7885c' : palette.wood} roughness={.8} /></RoundedBox>)}
    <mesh position={[-.9, .22, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.035, .035, 1.9, 8]} /><meshStandardMaterial color="#654a38" /></mesh>
    <mesh position={[.9, .22, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.035, .035, 1.9, 8]} /><meshStandardMaterial color="#654a38" /></mesh>
  </group>;
}

function Shed() {
  return <group position={[2.65, .02, -1.95]} rotation={[0, -.5, 0]}>
    <RoundedBox args={[1.18, 1, .9]} radius={.05} position={[0, .5, 0]} castShadow><meshStandardMaterial color="#c37e5d" roughness={.9} /></RoundedBox>
    <mesh position={[0, 1.16, 0]} rotation={[0, 0, Math.PI / 4]} castShadow><boxGeometry args={[.92, .92, 1.06]} /><meshStandardMaterial color="#704c3d" roughness={.95} /></mesh>
    <RoundedBox args={[.34, .65, .035]} radius={.03} position={[0, .34, .47]}><meshStandardMaterial color="#5c6f50" /></RoundedBox>
    <mesh position={[.38, .7, .47]}><boxGeometry args={[.24, .24, .04]} /><meshStandardMaterial color="#f1d89a" emissive="#e2b45e" emissiveIntensity={.3} /></mesh>
    <mesh position={[-.7, .2, .15]} rotation={[0, 0, -.15]}><cylinderGeometry args={[.1, .13, .7, 8]} /><meshStandardMaterial color="#8ca373" /></mesh>
  </group>;
}

function Fence() {
  const posts = [-3.2, -2.4, -1.6, -.8, 0, .8, 1.6, 2.4, 3.2];
  return <group position={[0, 0, -3]}>
    {posts.map((x) => <mesh key={x} position={[x, .32, 0]} castShadow><boxGeometry args={[.09, .72, .1]} /><meshStandardMaterial color="#9f7957" /></mesh>)}
    {[.18, .48].map((y) => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[6.55, .08, .08]} /><meshStandardMaterial color="#a98561" /></mesh>)}
  </group>;
}

function StonePath() {
  return <group>{Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[2.8 - i * .55, .025, 2.8 - i * .39]} rotation={[-Math.PI / 2, 0, (i % 2 ? .2 : -.12)]} receiveShadow>
    <circleGeometry args={[.25 + (i % 3) * .025, 7]} /><meshStandardMaterial color={i % 2 ? '#cabd9e' : '#d8c9aa'} roughness={1} />
  </mesh>)}</group>;
}

function Seedling({ selected }) {
  return <group>
    <mesh position={[0, .06, 0]} scale={[1.15, .25, .9]}><sphereGeometry args={[.52, 16, 10]} /><meshStandardMaterial color="#9d7552" /></mesh>
    <mesh position={[0, .38, 0]}><cylinderGeometry args={[.025, .035, .6, 7]} /><meshStandardMaterial color="#52764f" /></mesh>
    <mesh position={[-.13, .55, 0]} rotation={[0, 0, -.55]} scale={[1.5, .7, .8]}><sphereGeometry args={[.13, 12, 8]} /><meshStandardMaterial color="#79a367" /></mesh>
    <mesh position={[.13, .45, 0]} rotation={[0, 0, .55]} scale={[1.5, .7, .8]}><sphereGeometry args={[.12, 12, 8]} /><meshStandardMaterial color="#5f8c5c" /></mesh>
    {selected && <pointLight position={[0, .8, 0]} intensity={.8} color="#f4d486" distance={2} />}
  </group>;
}

function GardenWorld({ objects, onSelect, selected }) {
  return <>
    <color attach="background" args={['#dfe9d7']} />
    <ambientLight intensity={1.4} color="#fff9e8" />
    <directionalLight position={[-4, 7, 4]} intensity={2.4} color="#fff1c4" castShadow shadow-mapSize={[1024, 1024]} />
    <directionalLight position={[4, 3, -3]} intensity={.8} color="#bdd8e8" />
    <group rotation={[-.08, .2, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[4.7, 64]} /><meshStandardMaterial color="#b5c993" roughness={1} /></mesh>
      <mesh position={[0, -.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[4.25, 64]} /><meshStandardMaterial color="#7d9f68" roughness={1} /></mesh>
      <mesh position={[.1, .055, .35]} rotation={[-Math.PI / 2, 0, .2]} scale={[1.35, .8, 1]}><circleGeometry args={[1.12, 48]} /><meshStandardMaterial color="#78aeb3" roughness={.18} metalness={.08} /></mesh>
      <mesh position={[.1, .065, .35]} rotation={[-Math.PI / 2, 0, .2]} scale={[1.35, .8, 1]}><ringGeometry args={[.84, 1.04, 48]} /><meshStandardMaterial color="#b1c990" roughness={1} /></mesh>
      <Bridge />
      <Fence />
      <Shed />
      <StonePath />
      <Tree position={[-2.15, 0, -1.15]} scale={1.15} blossom />
      <Tree position={[1.85, 0, -1.3]} scale={.95} blossom />
      <Tree position={[2.25, 0, 1.4]} scale={.75} />
      <Bush position={[-3, 0, 1.35]} /><Bush position={[3, 0, .1]} color="#789b61" />
      <FlowerPatch position={[-2.25, 0, 2.25]} color="#d98b9b" /><FlowerPatch position={[2.2, 0, 2.1]} color="#e8b16d" />
      {objects.map((object, index) => {
        const point = objects.length > 1 ? plotPositions[index % plotPositions.length] : [0, .55];
        const position = [point[0], .05, point[1]];
        const isSelected = selected === object.id;
        const plantColor = plantColors[object.species] || (index % 3 === 0 ? '#698f61' : index % 3 === 1 ? '#c18476' : '#789e69');
        return <group key={object.id} position={position} onClick={(event) => { event.stopPropagation(); onSelect(object.id); }}>
          <Float speed={1.4} rotationIntensity={.05} floatIntensity={isSelected ? .16 : .04}>
            {object.seed ? <Seedling selected={isSelected} /> : <><mesh position={[0, .72 + (index % 2) * .1, 0]} scale={isSelected ? 1.12 : 1} castShadow><icosahedronGeometry args={[.52 + (index % 3) * .06, 1]} /><meshStandardMaterial color={plantColor} roughness={.82} /></mesh><mesh position={[0, .25, 0]}><cylinderGeometry args={[.08, .13, .7, 7]} /><meshStandardMaterial color="#78573d" /></mesh></>}
          </Float>
          {isSelected && <mesh position={[0, .02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.6, .68, 32]} /><meshBasicMaterial color="#f1d17e" /></mesh>}
        </group>;
      })}
    </group>
    <Sparkles count={34} scale={[8, 2, 8]} size={2} speed={.25} color="#f5d79b" />
    <ContactShadows position={[0, -.1, 0]} opacity={.28} scale={9} blur={2.8} far={5} />
    <OrbitControls enablePan={false} minDistance={5.8} maxDistance={10} minPolarAngle={.65} maxPolarAngle={1.2} autoRotate={!selected} autoRotateSpeed={.35} />
  </>;
}

export default function GardenScene({ objects = [], selected, onSelect }) {
  const visibleObjects = objects.length ? objects : [{ id: 'seed', seed: true }];
  return <div className="garden-3d" aria-label="Интерактивный 3D-сад">
    <Canvas shadows dpr={[1, 1.7]} camera={{ position: [6.8, 5.6, 7.2], fov: 37 }}>
      <GardenWorld objects={visibleObjects} selected={selected} onSelect={onSelect} />
    </Canvas>
  </div>;
}
