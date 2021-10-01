
if(window.location.search.substr(1) == "modify")
    document.querySelector("#ui").style.display = "unset";

/* Ocaml types would be along the lines of:

   type time = int
   type point = int * int
   type stroke = {
   points: point list,
   time: time
   }
   type block = {
   strokes: stroke list,
   time_before: time,
   time_after: time,
   speed: float,
   onlick: string,
   name: string,
   offsetX: int,
   offsetY: int,
   }
   type page = block list

   page, block and stroke are list objects with more attributes

*/

/* Atrament definition stuff */

const canvas = document.querySelector('#canvas-content');
const sketchpad = new Atrament(canvas);
sketchpad.smoothing = 0.1;
sketchpad.recordStrokes = false;

/* Async stuff */

let waiting = true;
let waitUntil = function (reference, speed, time) {
    let time_elapsed = (performance.now()-reference)*speed;
    let time_to_wait = time - time_elapsed;
    if(waiting)
	return new Promise(resolve => setTimeout(resolve, time_to_wait));
    return new Promise(resolve => resolve());
}
let waitFor = function (time, speed = 1) {
    let time_to_wait = time / speed;
    if(waiting)
	return new Promise(resolve => setTimeout(resolve, time_to_wait));
    return new Promise(resolve => resolve());
}
let now = function(reference) {
    return performance.now() - reference;
}

/* Recording stuff */

var website = {pages: [{name: "ui", blocks: [], speed: 1}], homepages:["ui"]};
var page = website.pages[0];
var current_index;
current_index = 0;
var activeBlockLinks;
activeBlockLinks = [];
setPage(website.pages[0]);
async function setPage(new_page) {
    /* clearSketchpad()*/
    page = new_page;
    setCurrentIndex(page.blocks.length);
    displayPageInfo();
    displayTimeline();
    displayWebsiteInfo();
    waiting = false;
    await drawPage(page);
    waiting = true;
}
displayTimeline();
function setCurrentIndex(index) {
    let all_buttons = document.querySelectorAll(".plus-button");
    if(document.querySelector(".plus-button.time-selected"))
	document.querySelector(".plus-button.time-selected").classList.remove("time-selected");
    if(all_buttons.length>index)
	all_buttons[index].classList.add("time-selected");
    current_index = index;
}
function newBlock() {
    return {
	strokes: [],
	offsetX: 0,
	offsetY: 0,
	speed: 1,
	name: "Unnamed",
	time_reference: performance.now(),
	onclick: "",
    };
}
function startRecording() {
    document.querySelector("#click-container").style.pointerEvents = "none";	     
    sketchpad.recordStrokes = true;
    current_block = newBlock();
}
function addStrokeToBlock(stroke, block) {
    if(block.strokes.length == 0) {
	block.time_before = now(block.time_reference) - stroke.points[stroke.points.length-1].time;
    }
    stroke.time = now(block.time_reference + block.time_before) - stroke.points[stroke.points.length-1].time;
    block.strokes.push(stroke);
}
sketchpad.addEventListener('strokerecorded', (stroke) => {
    addStrokeToBlock(stroke.stroke, current_block);
});
function endRecording() {
    sketchpad.recordStrokes = false;
    if(current_block.strokes.length == 0)
	return ;
    let last_stroke = current_block.strokes[current_block.strokes.length - 1];
    let last_point = last_stroke.points[last_stroke.points.length - 1];
    current_block.time_after = now(current_block.time_reference
				   + current_block.time_before
				   + last_stroke.time
				   + last_point.time);
    page.blocks.splice(current_index, 0, current_block);
    setCurrentIndex(current_index + 1);
    document.querySelector("#click-container").style.pointerEvents = "auto";
}

/* Drawing stuff */
let cancel = false;
let drawPoint = function (point, prevPoint) {
    if(!prevPoint)
	return null;
    if(sketchpad.mode == "erase")
	removeBlocksFromCoord({x:point.point.x, y:point.point.y});
    return sketchpad.draw(point.point.x, point.point.y, prevPoint.x, prevPoint.y);
};
let drawStroke = async function (stroke, speed, offsetX = 0, offsetY = 0) {
    let reference = performance.now();
    if(stroke.points.length == 0)
	return [0,0,0,0];
    sketchpad.mode = stroke.mode;
    sketchpad.weight = stroke.weight;
    sketchpad.smoothing = stroke.smoothing;
    sketchpad.color = stroke.color;
    sketchpad.adaptiveStroke = stroke.adaptiveStroke;
    await waitUntil(reference, speed, stroke.points[0].time);
    let prev_point = {x:stroke.points[0].point.x+offsetX, y:stroke.points[0].point.y+offsetY};
    await sketchpad.beginStroke(prev_point.x, prev_point.y);
    if(sketchpad.mode == "erase")
	removeBlocksFromCoord(prev_point);
    let minX = prev_point.x, minY = prev_point.y, maxX = prev_point.x, maxY = prev_point.y;
    for (const point of stroke.points.slice(1)) {
	if(cancel)
	    return [0,0,0,0];
	await waitUntil(reference, speed, point.time);
	let offseted_point = {point: {x: point.point.x+offsetX, y: point.point.y+offsetY}};
	minX = Math.min(minX, offseted_point.point.x);
	maxX = Math.max(maxX, offseted_point.point.x);
	minY = Math.min(minY, offseted_point.point.y);
	maxY = Math.max(maxY, offseted_point.point.y);
	prev_point = drawPoint(offseted_point, prev_point);
    }
    await sketchpad.endStroke(prev_point.x, prev_point.y);
    return [minX, minY, maxX, maxY];
};
let addBlockForDiv = function(minX, minY, maxX, maxY, onclick) {
    let div = document.createElement("div");
    div.classList.add("clicker");
    div.style.left = minX+"px";
    div.style.top = minY+"px";
    div.style.width = (maxX-minX)+"px";
    div.style.height = (maxY-minY)+"px";
    document.querySelector("#click-container").appendChild(div);
    div.addEventListener("click", (ev) => {eval(onclick);});
    activeBlockLinks.push({minX, minY, maxX, maxY, div});
};
function removeBlocksFromCoord(point) {
    let pointInBlock = (block) =>
	block.minX <= point.x && point.x <= block.maxX && block.minY <= point.y && point.y <= block.maxY;
    let list_to_remove = [];
    activeBlockLinks.forEach((clickable, i) => {
	if(pointInBlock(clickable)) {
	    list_to_remove.push(i);
	    clickable.div.remove();
	}
    });
    while(list_to_remove.length > 0) {
	let i = list_to_remove.pop();
	activeBlockLinks.splice(i, 1);
    }
}
let drawBlock = async function (block, speed = 1) {
    let reference = performance.now();
    let new_speed = (block.speed ?? 1) * speed;
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, - Infinity, - Infinity];
    for (const stroke of block.strokes) {
	if(cancel) return;
	await waitUntil(reference, new_speed, stroke.time);
	let [xm, ym, xM, yM] = await drawStroke(stroke, new_speed, block.offsetX, block.offsetY);
	minX = Math.min(minX, xm);
	maxX = Math.max(maxX, xM);
	minY = Math.min(minY, ym);
	maxY = Math.max(maxY, yM);
    }
    if(block.onclick != "") 
	addBlockForDiv(minX, minY, maxX, maxY, block.onclick);
}
var current_promise;
async function drawPage(page, speed = 1) {
    playing = true;
    document.querySelector("#ui").style.backgroundColor = "green";
    document.querySelector("#write-preventer").style.pointerEvents = "auto";
    let new_speed = page.speed * speed;
    for (const block of page.blocks) {
	if(cancel) {
	    document.querySelector("#ui").style.backgroundColor = "black";
	    document.querySelector("#write-preventer").style.pointerEvents = "none";
	    playing = false;
	    return;
	}
	await waitFor(block.time_before, new_speed);
	if(cancel) {
	    document.querySelector("#ui").style.backgroundColor = "black";
	    document.querySelector("#write-preventer").style.pointerEvents = "none";
	    playing = false;
	    return;
	}
	await drawBlock(block, new_speed);
	await waitFor(block.time_after, new_speed);
    }
    document.querySelector("#ui").style.backgroundColor = "black";
    document.querySelector("#write-preventer").style.pointerEvents = "none";
    playing = false;
}

/* Shortcuts */

var recording = false;
var playing = false;
document.addEventListener("keyup", (event) => {
    if(window.location.search.substr(1) != "modify")
	return;
    if(event.key == " " && !(event.target.tagName == "INPUT" && event.target.type == "text")){
	event.preventDefault();
	if(!playing) {
	    if(!recording) {
		document.querySelector("#ui").style.backgroundColor = "red";
		startRecording();
	    } else {
		document.querySelector("#ui").style.backgroundColor = "black";
		endRecording();
		displayTimeline(); 
	    }
	    recording = !recording;
	}
    }
});
document.addEventListener("keydown", (event) => {
    if(window.location.search.substr(1) != "modify")
	return;
    if(event.key == " " && !(event.target.tagName == "INPUT" && event.target.type == "text")){
	event.preventDefault();
    }
});

/* Clearing sketchpad */

function clearSketchpad() {
    /* emptying click-container */
    /* let clickContainer = document.querySelector("#click-container")
       while(clickContainer.firstChild){
       clickContainer.removeChild(clickContainer.firstChild);
       }*/
    activeBlockLinks.forEach((block_link) => {
	block_link.div.remove();
    });
    activeBlockLinks = [];
    sketchpad.clear();
}

/* Utility functions */

async function gotoPage(pageNames) {
    let f = async function() {
	for(const pageName of pageNames) {
	    if(cancel) return;
	    await drawPage(website.pages.find((page) => page.name == pageName), 1);
	}		 
    };
    cancel = true;
    if(current_promise) {
	current_promise.then(() => {
	    cancel = false;
	    current_promise = f();
	});
    }
    else {
	cancel = false;
	current_promise = f();
    }
    /* clearSketchpad()*/
}
function gotoURL(url) {
    window.open(url, "_blank");
}

/* ******************************************************** */
/* UI stuff */
/* ******************************************************** */

/* Timeline stuff */

function create_add_button(index) {
    let plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = () => {setCurrentIndex(index);};
    if(index == current_index)
	plus.classList.add("time-selected");
    plus.classList.add("plus-button");
    return plus;
}
function createDiv (txt, classes = [], value = "", f, tag = "div") {
    let div = document.createElement(tag);
    classes.forEach((c) => {
	div.classList.add(c);
    });
    if(txt !== "")
	div.appendChild(document.createTextNode(txt));
    let input = document.createElement("input");
    if(value !== "")
	input.value = value;
    div.appendChild(input);
    input.addEventListener("change", () => {
	f(input.value);
    });
    return div;
}
let blockToDiv = function(block, index) {
    let block_div = document.createElement("div");
    block_div.appendChild(createDiv("Block :  ", [], block.name,
				    (name) => {block.name = name;}, "h3"));
    block_div.appendChild(createDiv("Time before :  ", [], block.time_before,
				    (tb) => {block.time_before = tb;}));
    block_div.appendChild(createDiv("Speed :  ", [], block.speed,
				    (speed) => {block.speed = parseFloat(speed);}));
    block_div.appendChild(createDiv("OffsetX :  ", [], block.offsetX, 
				    (o) => {block.offsetX = parseInt(o);}));
    block_div.appendChild(createDiv("OffsetY :  ", [], block.offsetY, 
				    (o) => {block.offsetY = parseInt(o);}));
    block_div.appendChild(createDiv("Onclick :  ", [], block.onclick, 
				    (oc) => {block.onclick = oc;}));
    block_div.appendChild(createDiv("Time after :  ", [], block.time_after, 
				    (ta) => {block.time_after = ta;}));
    let del = document.createElement("button");
    del.textContent = "X";
    del.onclick = () => {page.blocks.splice(index, 1); if (current_index > index) setCurrentIndex(current_index -1); displayTimeline();};
    block_div.appendChild(del);
    block_div.classList.add("block-in-timeline");
    return block_div;
}
function displayTimeline() {
    let timeline_div = document.querySelector("#timeline");
    /* emptying timeline */
    while(timeline_div.firstChild){
	timeline_div.removeChild(timeline_div.firstChild);
    }
    /* populating timeline */
    timeline_div.appendChild(create_add_button(0));
    let i = 1;
    for(const block of page.blocks) {
	let block_div = blockToDiv(block, i-1);
	timeline_div.appendChild(block_div);
	timeline_div.appendChild(create_add_button(i++));
    }
}

/* Website stuff */

function displayPageInfo() {
    let pageInfo = document.querySelector("#page-info");
    /* emptying pageInfo */
    while(pageInfo.firstChild){
	pageInfo.removeChild(pageInfo.firstChild);
    }
    pageInfo.appendChild(createDiv("Page name : ", [], page.name,
				   (name) => {page.name = name;}));
    pageInfo.appendChild(createDiv("Page speed : ", [], page.speed,
				   (speed) => {page.speed = parseFloat(speed);}));
}
function displayWebsiteInfo() {
    let websiteInfo = document.querySelector("#website-info");
    /* emptying websiteInfo */
    while(websiteInfo.firstChild){
	websiteInfo.removeChild(websiteInfo.firstChild);
    }
    for(const pageOf of website.pages) {
	let button = document.createElement("button");
	button.innerText = pageOf.name;
	button.addEventListener("click", (ev) => {
	    setPage(pageOf);
	});
	websiteInfo.appendChild(button);
    }
    let button = document.createElement("button");
    button.innerText = "+";
    button.addEventListener("click", (ev) => {
	let new_page = {name: "No name", speed: 1, blocks: []};
	website.pages.push(new_page);
	setPage(new_page);
    });
    websiteInfo.appendChild(button);
    let homePagesInput = document.querySelector("#homepages-input");
    homePagesInput.value = JSON.stringify(website.homepages);
}

function save() {
    let jsonText = JSON.stringify(website);
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(jsonText));
    element.setAttribute('download', "written-website.json");

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();
    
    console.log(jsonText);
    
    document.body.removeChild(element);
}
function loadJSON(file) {
    website = JSON.parse(file);
    displayWebsiteInfo();
    page = website.pages[0];
    displayPageInfo();
    displayTimeline();
    displayWebsiteInfo();
}
let loadCaller = () => {
    let reader  = new FileReader();
    let file = document.querySelector('#load-input').files[0];
    reader.addEventListener("load", function () {
	loadJSON(reader.result);
    });
    if(file) {
	reader.readAsText(file);
    }
};
document.querySelector("#save-input").addEventListener("click", save);
document.querySelector("#load-input").addEventListener("change", loadCaller);

function fetchJSONFile(path, callback) {
    var httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function() {
	if (httpRequest.readyState === 4) {
	    if (httpRequest.status === 200) {
		if (callback) callback(httpRequest.responseText);
	    }
	}
    };
    httpRequest.open('GET', path);
    httpRequest.send(); 
}
function startWebsite(websiteName) {
    // this requests the file and executes a callback with the parsed result once
    //   it is available
    fetchJSONFile(websiteName, function(data){
	loadJSON(data);
	if(window.location.search.substr(1) != "modify")
	    gotoPage(website.homepages);
    });
}
