export function perturbPixels(original:Uint8ClampedArray,epsilon?:number,random?:()=>number):{pixels:Uint8ClampedArray;mse:number;psnr:number|null;maxDelta:number};
export function validateImageHeader(bytes:Uint8Array,type:string,size:number):void;
