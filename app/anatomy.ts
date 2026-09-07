export type SystemId = 'skeletal'|'muscular'|'arterial'|'venous'|'nervous'|'digestive'|'respiratory'|'urinary'|'reproductive'|'lymphatic'|'endocrine'|'integumentary'|'connective'|'sensory'|'cardiac'|'pregnancy';
export const SYSTEMS: {id:SystemId;name:string;color:string;description:string}[] = [
 {id:'skeletal',name:'Skeleton',color:'#e2d9ba',description:'Bones form the supporting framework of the body, protect organs, and provide attachment points for muscles. Their internal tissue also stores minerals and produces blood cells.'},
 {id:'muscular',name:'Muscles',color:'#a85b50',description:'Skeletal muscles generate movement by pulling on their attachments. Together with tendons, they move joints, stabilize posture, and produce heat.'},
 {id:'cardiac',name:'Heart',color:'#b96760',description:'The heart is a muscular pump with four chambers. Its valves direct blood forward through the pulmonary and systemic circuits.'},
 {id:'sensory',name:'Sensory organs',color:'#b0c8ce',description:'These structures contribute to special senses, including sight, hearing, and balance. Their specialized tissues detect stimuli and work with the nervous system to convey information.'},
 {id:'arterial',name:'Arteries',color:'#c05245',description:'The heart drives blood through the circulation. Arteries carry blood away from the heart to supply tissues or, in the pulmonary circuit, to the lungs.'},
 {id:'venous',name:'Veins',color:'#527c9f',description:'Veins return blood toward the heart. Superficial and deep networks collect blood from the tissues; the pulmonary veins bring oxygenated blood back from the lungs.'},
 {id:'nervous',name:'Nervous system',color:'#d8b565',description:'The brain, spinal cord, and peripheral nerves carry and process signals. They support sensation, movement, coordination, and automatic regulation of body functions.'},
 {id:'respiratory',name:'Respiratory',color:'#b98991',description:'The airways conduct air to the lungs, where oxygen and carbon dioxide move between air and blood. Breathing depends on pressure changes produced by respiratory muscles.'},
 {id:'digestive',name:'Digestive',color:'#b8916b',description:'The digestive tract breaks down food, absorbs nutrients and water, and moves waste onward. Accessory organs contribute bile and digestive enzymes.'},
 {id:'urinary',name:'Urinary',color:'#b47961',description:'The kidneys filter blood and regulate fluid, electrolyte, and acid–base balance. Urine travels through the ureters to the bladder and exits through the urethra.'},
 {id:'lymphatic',name:'Lymphatic',color:'#879f7c',description:'Lymphatic vessels return excess tissue fluid to the circulation. Lymph nodes and other lymphoid organs support immune surveillance and responses.'},
 {id:'endocrine',name:'Endocrine',color:'#c5a09a',description:'Endocrine organs release hormones into the blood to coordinate processes such as metabolism, growth, stress responses, and reproduction.'},
 {id:'reproductive',name:'Reproductive',color:'#bda098',description:'Female reproductive structures include the ovaries, uterine tubes, uterus, cervix, and vagina. Together they support oocyte development, fertilization, menstruation, and pregnancy.'},
 {id:'integumentary',name:'Body surface',color:'#ba9b7d',description:'The body surface provides an outer anatomical reference. The integumentary system forms a protective barrier and contributes to sensation and temperature regulation.'},
 {id:'pregnancy',name:'Pregnancy reference',color:'#b88380',description:'The placenta and umbilical cord support exchange between maternal and fetal circulations during pregnancy. These reference structures are shown separately from the default adult anatomy.'},
 {id:'connective',name:'Connective tissue',color:'#aec3bb',description:'Cartilage, ligaments, and other connective tissues support, connect, and separate structures. Their roles include stabilizing joints and distributing mechanical loads.'},
];
export interface Part {id:string;name:string;conceptId:string;system:SystemId;chunk:number;positions:number;normals:number;indices:number;vertexCount:number;indexCount:number;bounds:[number[],number[]]}
export interface Concept {id:string;name:string;elements:string[]}
export interface Atlas {version:string;sex?:'female'|'male';source?:string;scope?:string;parts:Part[];concepts:Concept[];chunks:{url:string;bytes:number;gzip?:string;gzipBytes?:number}[];triangles:number}
export type View = 'three-quarter'|'front'|'back'|'side';
export interface SceneState {inspectorOpen?:boolean;explode:number;visible:SystemId[];selected:string[];isolate:boolean;view:View;rotate:boolean;reset:number}
export const DEFAULT_VISIBLE:SystemId[] = ['cardiac','sensory','skeletal','muscular','arterial','venous','nervous','respiratory','digestive','urinary','lymphatic','endocrine','reproductive','integumentary','pregnancy','connective'];
export const EXPLANATIONS:Record<string,string> = {
 'breast (mammary gland)':'The female breast contains glandular lobes that produce milk, supported by adipose tissue and Cooper’s ligaments, draining through lactiferous ducts to the nipple.',
 'breast':'The female breast contains glandular lobes that produce milk, supported by adipose tissue and Cooper’s ligaments, draining through lactiferous ducts to the nipple.',
 'left breast':'The left mammary gland complex, consisting of glandular lobes, lactiferous ducts and sinuses, adipose tissue, and the left nipple-areolar complex.',
 'right breast':'The right mammary gland complex, consisting of glandular lobes, lactiferous ducts and sinuses, adipose tissue, and the right nipple-areolar complex.',
 'mammary gland':'Glandular structure in the breast specialized for milk production during lactation, regulated by prolactin, oxytocin, estrogen, and progesterone.',
 'mammary lobe':'One of the 15 to 20 glandular divisions of the mammary gland, each composed of lobules and alveoli that produce milk.',
 'main lactiferous duct':'A tube that conducts milk from a mammary lobe to the lactiferous sinus beneath the areola.',
 'lactiferous sinus':'An expanded reservoir behind the nipple where milk accumulates before ejection through the nipple pores.',
 'left nipple':'The pigmented external projection on the left breast containing sensory nerve endings and openings for lactiferous ducts.',
 'right nipple':'The pigmented external projection on the right breast containing sensory nerve endings and openings for lactiferous ducts.',
 'left female areola':'The circular pigmented skin surrounding the left nipple, containing Montgomery glands (areolar tubercles) that lubricate the nipple during nursing.',
 'right female areola':'The circular pigmented skin surrounding the right nipple, containing Montgomery glands (areolar tubercles) that lubricate the nipple during nursing.',
 'areolar tubercle':'Small elevated glands on the areola (Montgomery tubercles) that secrete protective lipoid fluid to protect and lubricate the nipple.',
 'suspensory ligament of left breast':'Also known as Cooper’s ligament, a fibrous band of connective tissue that provides structural framework and suspends the breast.',
 'suspensory ligament of right breast':'Also known as Cooper’s ligament, a fibrous band of connective tissue that provides structural framework and suspends the breast.',
 'interlobar adipose tissue of left mammary gland':'Subcutaneous fatty tissue surrounding the mammary lobes that determines the contour, volume, and softness of the breast.',
 'interlobar adipose tissue of right mammary gland':'Subcutaneous fatty tissue surrounding the mammary lobes that determines the contour, volume, and softness of the breast.',
 'uterus':'A hollow muscular organ in the pelvis. Its lining changes through the menstrual cycle and can support implantation and development during pregnancy.',
 'vagina':'A muscular canal connecting the cervix of the uterus to the outside of the body. It provides a passage for menstrual flow and forms part of the birth canal.',
 'ovary':'An organ that contains developing oocytes and produces hormones including estrogen and progesterone.',
 'uterine tube':'Also called the fallopian tube, a paired conduit that transports ova from the ovaries to the uterus and is the typical site of fertilization.',
 'placenta':'A temporary organ that develops during pregnancy to provide oxygen and nutrients to the fetus while removing waste products from the fetal blood.',
 'umbilical cord':'A flexible, cord-like structure connecting the fetus to the placenta, carrying blood vessels that transport nutrients and oxygen to the developing fetus.',
 'heart':'A muscular pump in the chest. Its right side sends blood to the lungs; its left side sends blood through the systemic circulation.',
 'liver':'A large organ beneath the right side of the diaphragm. It processes absorbed nutrients, produces bile, and synthesizes many proteins carried in the blood.',
 'brain':'The central organ of the nervous system. Its interconnected regions support perception, movement, memory, language, and the regulation of bodily functions.',
 'stomach':'A muscular chamber between the esophagus and small intestine. It stores and mixes food with acid and enzymes before releasing it into the duodenum.',
 'spleen':'A lymphoid organ in the upper left abdomen. It filters blood, removes aging blood cells, and participates in immune responses.',
 'pancreas':'An abdominal organ with digestive and endocrine roles. It supplies enzymes to the small intestine and releases hormones including insulin and glucagon.',
 'urinary bladder':'A muscular reservoir in the pelvis that stores urine arriving from the kidneys through the ureters.',
 'trachea':'The main airway connecting the larynx to the bronchi. Its cartilage supports keep the airway open during breathing.',
 'diaphragm':'A broad muscle separating the chest and abdomen. When it contracts, it increases chest volume and helps draw air into the lungs.',
};
export function explanation(name:string,system:SystemId){return EXPLANATIONS[name.toLowerCase()] ?? SYSTEMS.find(s=>s.id===system)?.description ?? '';}
