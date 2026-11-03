import {contactFeatures} from './contacts.mjs';
import {routeRequest,demoPlaces} from './routing.mjs';
import {json} from './server.mjs';
export async function features(c){
 if(contactFeatures(c))return true;
 if(c.path==='/api/v1/navigation/places'&&c.method==='GET'){json(c.res,200,demoPlaces);return true;}
 if(c.path==='/api/v1/navigation/route'&&c.method==='POST'){json(c.res,200,await routeRequest(c.data));return true;}
 return false;
}
