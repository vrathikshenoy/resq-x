export function perturbPixels(original,epsilon=8,random=Math.random){
 if(!(original instanceof Uint8ClampedArray)||original.length%4!==0||!Number.isInteger(epsilon)||epsilon<1||epsilon>8)throw new Error('Invalid pixel data or perturbation budget.');
 const pixels=new Uint8ClampedArray(original);let squared=0,maxDelta=0;
 for(let i=0;i<pixels.length;i++){if(i%4===3)continue;const delta=Math.floor(random()*(2*epsilon+1))-epsilon;pixels[i]=Math.max(0,Math.min(255,pixels[i]+delta));const actual=pixels[i]-original[i];squared+=actual*actual;maxDelta=Math.max(maxDelta,Math.abs(actual));}
 const mse=squared/(pixels.length/4*3);return {pixels,mse,psnr:mse?10*Math.log10(255**2/mse):null,maxDelta};
}
export function validateImageHeader(bytes,type,size){
 if(size>10*1024*1024||size===0)throw new Error('Choose a nonempty image smaller than 10 MB.');
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!((type==='image/png'&&png)||(type==='image/jpeg'&&jpeg)||(type==='image/webp'&&webp)))throw new Error('Choose a valid JPEG, PNG or WebP image.');
}
