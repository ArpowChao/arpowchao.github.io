/* Raised leather seam and 108 pairs of red thread arcs, built from the same
 * seam curve/height as the JavaScript aerodynamic model. Display geometry
 * does not replace the reduced-order boundary-layer/force model. */
(function(root) {
  'use strict';
  function build(T,model) {
    const material=options=>{const m=new T.MeshStandardMaterial(options);m.color.convertSRGBToLinear();return m;};
    const vector=p=>new T.Vector3(p[0],p[2],-p[1]);
    const points=model.seam.pts.map(vector),closed=points.concat([points[0]]),arc=[0];
    for(let i=1;i<closed.length;i++)arc.push(arc.at(-1)+closed[i].distanceTo(closed[i-1]));
    const length=arc.at(-1),height=model.ball.seam_height/model.ball.R,width=model.ball.seam_width/model.ball.R;
    function sample(distance) {
      distance=((distance%length)+length)%length;let low=0,high=arc.length-1;
      while(high-low>1){const mid=(low+high)>>1;if(arc[mid]<=distance)low=mid;else high=mid;}
      return closed[low].clone().lerp(closed[high],(distance-arc[low])/(arc[high]-arc[low])).normalize();
    }
    function tube(paths,lateral,radial=lateral,loop=false,sides=8) {
      const positions=[],indices=[];
      for(const path of paths) {
        const base=positions.length/3,n=path.length;
        for(let i=0;i<n;i++) {
          const previous=path[loop?(i+n-1)%n:Math.max(0,i-1)],next=path[loop?(i+1)%n:Math.min(n-1,i+1)];
          const tangent=next.clone().sub(previous).normalize(),across=new T.Vector3().crossVectors(tangent,path[i]).normalize();
          const up=new T.Vector3().crossVectors(across,tangent).normalize();
          for(let j=0;j<sides;j++) {
            const angle=j*2*Math.PI/sides;
            const vertex=path[i].clone().addScaledVector(across,lateral*Math.cos(angle)).addScaledVector(up,radial*Math.sin(angle));
            positions.push(...vertex.toArray());
          }
        }
        for(let i=0;i<(loop?n:n-1);i++)for(let j=0;j<sides;j++) {
          const a=base+i*sides+j,b=base+((i+1)%n)*sides+j,c=base+i*sides+(j+1)%sides,d=base+((i+1)%n)*sides+(j+1)%sides;
          indices.push(a,b,c,c,b,d);
        }
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
    }
    const ridge=Array.from({length:864},(_,i)=>sample(i*length/864));
    const band=new T.Mesh(tube([ridge.map(p=>p.clone().multiplyScalar(.998))],width*.36,Math.min(.008,height*.28),true),material({color:0xe8ddc7,roughness:.93}));
    const crease=new T.Mesh(tube([ridge.map(p=>p.clone().multiplyScalar(1.003))],.0025,.0025,true,6),material({color:0x76604e,roughness:1}));
    const paths=[],spacing=length/108,radius=Math.min(.0055,height*.23);
    for(let i=0;i<108;i++) {
      const distance=(i+.5)*spacing,center=sample(distance),tangent=sample(distance+spacing*.05).sub(sample(distance-spacing*.05)).normalize();
      const across=new T.Vector3().crossVectors(tangent,center).normalize();
      for(const side of [-1,1]) paths.push(Array.from({length:10},(_,j)=>{
        const u=j/9,lift=.55*radius+(height-1.55*radius)*Math.sin(u*Math.PI/2)**.8;
        return center.clone().addScaledVector(tangent,(2*u-1)*spacing*.23).addScaledVector(across,side*width*.5*(1-u)).normalize().multiplyScalar(1+lift);
      }));
    }
    const stitch=new T.Mesh(tube(paths,radius),material({color:0xc20b2e,roughness:.74}));
    const group=new T.Group();group.add(band,crease);
    const samples=points.filter((_,i)=>i%4===0),statusGeometry=new T.BufferGeometry().setFromPoints(samples.concat([samples[0]]).map(p=>p.clone().multiplyScalar(1+height+.004)));
    statusGeometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array((samples.length+1)*3),3));
    const st=new T.Line(statusGeometry,new T.LineBasicMaterial({vertexColors:true}));
    const dots=new T.Points(statusGeometry,new T.PointsMaterial({size:.035,vertexColors:true}));
    st.visible=dots.visible=false;
    const result={tube:group,st,dots,stitch,statusGeometry,samples,
      dispose(){for(const item of [band,crease,stitch,st,dots]){item.geometry.dispose();item.material.dispose();}}};
    return result;
  }
  if(typeof module!=='undefined')module.exports={build};else root.BABallVisual={build};
})(typeof window!=='undefined'?window:globalThis);
