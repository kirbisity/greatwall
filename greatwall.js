/* Greatwall app JS*/
/*
Things to improve when I had time:
	Improve the efficiency of finding the closest wall section by remembering the last closest wall.
	
	Currently path finding is done by line of sight, but I plan to impletement search algotithms, 
	the difficuit part here is how to define a node.
	
	Use the midpoint of end nodes of two wall sections as node to find the shortest path
*/

let background = document.getElementById('background');
let canvas1 = document.getElementById('canvas1');
let canvas2 = document.getElementById('canvas2');
let ctxbg = background.getContext('2d');
let marginR = 0;
let W = window.innerWidth - marginR;
let H = window.innerHeight;
background.width = W;
background.height = H;
canvas1.width = W;
canvas1.height = H;
canvas2.width = W;
canvas2.height = H;

let scale;
let topBarMargin = 0;
let sideBarMargin = 0;

let firstStart = true;
let paused = true;
let drawButton = false;
let resetButton = false;
let destroyBtn = false;
let scaleButton = false;
let ungradeCastleBtn = false;

//those should not be reset by restart
let firstUpgrade = false;
let firstWall = false;

let homeX = 0;
let homeY = 0;
let mouseX = 0;
let mouseY = 0;

//for drawWall feature
let lastWallc = {x: 9007199254740991, y: 9007199254740991};


let CanvasOffsetX = W * 0.5;
let CanvasOffsetY = H * 0.5;
let walls = [];
let castles = [];
let raiders = [];
let mouseStatusDown = false;
let drawNewGrid = true;
let equation = 'y=x * 0.5';
let scaleBeginMouse = {x: -1, y: -1};

let epsilon = 0.05;
let epsilonScale = 50;

let fps = 60;
let debugMode = false;
let speedVectorContant = 2;

let timecountsmall = 0;
let timecountlarge = 0;

let enemyInterval = 4;
let token = 1000;
let bestscore = 0;
let sound = 0.01;
let soundlevel = 40;
let graphics = {shadow: false};

let season = 0;
let seasonmessage = [
					'Its autumn now',
					'Freezing Winter comes, cost of wall construction doubles.', 
					'Spring comes, a new type of raider occurs.',
					'Summer comes, a new type of raider occurs.',
					'Autumn comes, a good harvest doubles the income of the castle'
					];
let backgroundcolors = [
					'#84693f',
					'#7f725e',
					'#727f4e',
					'#817841'
					];

// variables of cloud save
let data;
let username;
let userID;

ctxbg = background.getContext('2d'); /* layer for background info and grid*/
ctx = canvas1.getContext('2d'); /* layer for trail*/
ctx2 = canvas2.getContext('2d'); /* layer for object*/

//castles
let EC0A = new Image();
EC0A.src ='images/castles/european_castle_small.png';
let CC0A = new Image();
CC0A.src ='images/castles/castle_small.png';
let CC1A = new Image();
CC1A.src ='images/castles/castle_medium.png';
let CC2A = new Image();
CC2A.src ='images/castles/castle_large.png';

//units
let CR0A = new Image();
CR0A.src ='images/units/saber_cavalry_eastern.png';
let CR0B = new Image();
CR0B.src ='images/units/saber_cavalry_eastern1.png';

let IR0A = new Image();
IR0A.src ='images/units/light_infantry.png';
let IR0B = new Image();
IR0B.src ='images/units/light_infantry1.png';

let IR1A = new Image();
IR1A.src ='images/units/sword_infantry.png';
let IR1B = new Image();
IR1B.src ='images/units/sword_infantry1.png';

let CR1A = new Image();
CR1A.src ='images/units/spear_cavalry.png';
let CR1B = new Image();
CR1B.src ='images/units/spear_cavalry1.png';




function initaudio() {
    let bgMusic = document.getElementById("backgroundmusic");
    bgMusic.addEventListener('ended', loopAudio, false);
	bgMusic.play();
}
function loopAudio() {
    let bgMusic = document.getElementById("backgroundmusic");
    bgMusic.play();
}

function bgmusicBtn(){
    let bgMusic = document.getElementById("backgroundmusic");
    bgMusic.play();
}

function soundBtn() {
    let bgMusic = document.getElementById("backgroundmusic");
	if (soundlevel > 0){
		soundlevel = soundlevel - 20;
	} else {
		soundlevel = 100;
	}
	bgMusic.volume = sound * soundlevel;
	if (soundlevel == 0){
		document.getElementById('soundBtn').innerText = 'Sound Off';
	} else {
		document.getElementById('soundBtn').innerText = 'Sound: ' + soundlevel;
	}
}

/**
 * initial setup for all included files and jQuery
 */
function setup() {
    // include saveToCloud helper file
    let saveCloud = document.createElement('script');
    saveCloud.src = 'saveToCloud.js';
    document.getElementsByTagName('head')[0].appendChild(saveCloud);
    // jQuery setup
    $('html,body').css('cursor', 'move');
    $(window).resize(function() {
		location.reload();
	});
}

/**
 * Creates a section of wall.
 *
 * @constructor
 * @author: yanlin
 * @this {WallSection}
 */
function WallSection() {
    this.start = {x: 0, y: 0};
    this.end = {x: 0, y: 0};
	this.health = 100;
	this.attack = 1;
	this.defense = 2;
	this.type = '0';
	this.unitCost = 2;
};

WallSection.prototype.getLength = function() {
    return getDistance(this.start, this.end);
};

WallSection.prototype.getHit = function(raider) {
    this.health -= raider.attack/this.defense;
};


let dataCastle = [
				['Small Castle', 'CC0', 300, 100, 40, 2, 3, 20, 'CC1', CC0A],
				['Medium Castle', 'CC1', 1000, 200, 80, 2, 3, 40, 'CC2', CC1A],
				['Fortified City', 'CC2', 3000, 400, 160, 2, 3, 60, 'none', CC2A]
				 ];
/**
 * Creates a castle.
 *
 * @constructor
 * @author: yanlin
 * @this {Castle}
 */
function Castle(tp) {
    this.position = {x: 0, y: 0};
	for (let i=0; i<dataCastle.length; i++){
		if (dataCastle[i][1]==tp){
			this.name = dataCastle[i][0];
			this.type = tp;
			this.cost = dataCastle[i][2];
			this.healthBar = dataCastle[i][3];
			this.health = dataCastle[i][3];
			this.wealth = dataCastle[i][4];
			this.attack = dataCastle[i][5];
			this.defense = dataCastle[i][6];
			this.hitbox = dataCastle[i][7];
			this.nextType = dataCastle[i][8];
			this.imageA = dataCastle[i][9];
		}
	}
};

Castle.prototype.getHit = function(raider) {
    this.health -= raider.attack/this.defense;
};

//decide the frequency of random raider generated
let randomRaider = [
				['CR0', 'CR0', 'IR0', 'IR0', 'IR0'],
				['CR0', 'CR0', 'IR0', 'IR0', 'IR1'],
				['CR0', 'CR1', 'IR0', 'IR1', 'IR1'],
				['CR0', 'CR1', 'CR1', 'IR1', 'IR1'],
				['CR1', 'CR1', 'CR1', 'IR1', 'IR1']
				   ];

let dataRaider = [
				['Sabre Cavalry', 'CR0', 18, 10, 5, 2, 5, CR0A, CR0B, 40],
				['Light Axe Infantry', 'IR0', 7, 20, 2, 3, 2, IR0A, IR0B, 30],
				['Light Sword Infantry', 'IR1', 7, 20, 3, 5, 2, IR1A, IR1B, 30],
				['Spear Cavalry', 'CR1', 20, 10, 10, 2, 6, CR1A, CR1B, 50]
				 ];

/**
 * Creates a raider.
 *
 * @constructor
 * @author: yanlin
 * @this {Rastle}
 */
function Raider(tp) {
	this.position = {x: 0, y: 0};
	this.vx = 0;
	this.vy = 0;
	for (let i=0; i<dataRaider.length; i++){
		if (dataRaider[i][1]==tp){
			this.name = dataRaider[i][0];
			this.type = tp;
			this.speed = dataRaider[i][2];
			this.health = dataRaider[i][3];
			this.attack = dataRaider[i][4];
			this.defense = dataRaider[i][5];
			this.range = dataRaider[i][6];
			this.imageA = dataRaider[i][7];
			this.imageB = dataRaider[i][8];
			this.waypoint = {x: 0, y: 0};
			this.destination = {x: 0, y: 0};
			this.lineOfSight = dataRaider[i][9];
			this.steering = 0.01;
			this.totalAngle = 0;
		}
	}
};

Raider.prototype.getHit = function(attacker) {
    this.health -= attacker.attack/this.defense;
};




function openNav() {
	document.getElementById('myNav').style.height = '100%';
}

function closeNav() {
	document.getElementById('myNav').style.height = '0%';
}

function openSetting() {
    document.getElementById('settingMenu').style.height = '100%';
}
function closeSetting() {
	document.getElementById('settingMenu').style.height = '0%';
}

document.addEventListener('keydown', keyPush);
document.addEventListener('click', mouseClicks);
document.addEventListener('mousemove', mouseMoves);
document.addEventListener('mousedown', function() {
    mouseStatusDown = true;
});
document.addEventListener('mouseup', function() {
	lastWallc = {x: 9007199254740991, y: 9007199254740991};
    if (scaleButton) {
        scaleBeginMouse.x = -1;
        scaleBeginMouse.y = -1;
    }
    mouseStatusDown = false;
});

document.addEventListener('wheel', mousewheel);

/** translate canvas coordinates to object coordinates
    @param {object} ctxc - the canvas coordinate
    @param {int} ctxc.x - the canvas x-coordinate
    @param {int} ctxc.y - the canvas y-coordinate
    @return {object}
*/
function canvasToObj(ctxc) {
    return {x: ((ctxc.x - CanvasOffsetX)/ parseFloat(scale*epsilonScale) ),
    y: -(ctxc.y + CanvasOffsetY - H)/ parseFloat(scale*epsilonScale)};
}

/** translate object coordinates to canvas coordinates
    @param {object} objc - the object coordinate
    @param {int} objc.x - the object x-coordinate
    @param {int} objc.y - the object y-coordinate
    @return {object}
*/
function objToCanvas(objc) {
    return {x: parseInt( parseFloat(scale*epsilonScale)
        * objc.x + CanvasOffsetX),
    y: parseInt(H - parseFloat(scale*epsilonScale) * objc.y - CanvasOffsetY)};
}

/** get mouseclick position
    @param {event} event - the event
*/
function mouseClicks(event) {
    if (event.clientY < topBarMargin) {
        return;
    }
    if (event.clientX > W-sideBarMargin) {
        return;
    }
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (resetButton) {
        let objc = canvasToObj({x: mouseX, y: mouseY});
        homeX = objc.x;
        homeY = objc.y;
        updateScreen();
    }
	if (ungradeCastleBtn) {
		let objc = canvasToObj({x: mouseX, y: mouseY});
		for (let i=0; i<castles.length; i++){
			if (getDistance(objc, castles[i].position) < castles[i].hitbox * 3){
				upgradeCastle(i);
			}
			return;
		}
	}
}

/** get mouseMoves position
@param {event} event - the event
*/
function mouseMoves(event) {
    if (event.clientY < topBarMargin) {
        return;
    }
    if (event.clientX > W-sideBarMargin) {
        return;
    }
    let oldmouseX = mouseX;
    let oldmouseY = mouseY;
    mouseX = event.clientX;
    mouseY = event.clientY;
    let objc = canvasToObj({x: mouseX, y: mouseY});
	let oldObjc = canvasToObj({x: oldmouseX, y: oldmouseY});
    // scale the canvas by mouse
    if (scaleButton && mouseStatusDown) {
        if (scaleBeginMouse.x == -1 && scaleBeginMouse.y == -1) {
            scaleBeginMouse.x = mouseX;
            scaleBeginMouse.y = mouseY;
        }
        let oMouse = canvasToObj({x: scaleBeginMouse.x, y: scaleBeginMouse.y});
        let delta = Math.max(-5, Math.min(5, (oldmouseY - mouseY)/5));
        if (delta < 0) {
            $('html,body').css('cursor', 'zoom-out');
        }
        if (delta > 0) {
            $('html,body').css('cursor', 'zoom-in');
        }
        scale = Math.min(1, Math.max(0.01, scale*(1+0.05*parseFloat(delta))));
        let cnMouse = objToCanvas(oMouse);
        CanvasOffsetX += scaleBeginMouse.x - cnMouse.x;
        CanvasOffsetY -= scaleBeginMouse.y - cnMouse.y;
        drawNewGrid = true;
        updateScreen();
    }
    // put a new node to the wall
    if (drawButton && mouseStatusDown) {
		if (token < 0){
			return;
		}
		if (lastWallc.x == 9007199254740991){
			lastWallc = objc;
		}
		if (getDistance(lastWallc, objc) > 30 && getDistance(lastWallc, objc) < 200) {
			for (let i=0; i<castles.length; i++) {
				if (getDistance(objc, castles[i].position) < castles[i].hitbox * 1.5) {
					lastWallc = {x: 9007199254740991, y: 9007199254740991};
					return;
				}
			}
			newSection = new WallSection();
			newSection.start = lastWallc;
			for (let i=0; i<walls.length; i++) {
				if (getDistance(walls[i].start, lastWallc) < 20){
					newSection.start = walls[i].start;
					break;
				}
				if (getDistance(walls[i].end, lastWallc) < 20){
					newSection.start = walls[i].end;
					break;
				}
			}
			newSection.end = objc;
			for (let i=0; i<walls.length; i++) {
				if (getDistance(walls[i].start, objc) < 20){
					newSection.end = walls[i].start;
					break;
				}
				if (getDistance(walls[i].end, objc) < 20){
					newSection.end = walls[i].end;
					break;
				}
			}
			if (newSection.getLength() > 1) {
				//winter comes
				let multiplier = 1;
				if (season % 4 == 1) {
					multiplier = 8;
				}
				if (token < newSection.getLength() * newSection.unitCost * multiplier){
					displayInfo('Not enough money');
					return;
				}
				walls.push(newSection);
				
				token -= parseInt(newSection.getLength() * newSection.unitCost * multiplier);
				document.getElementById('token0').innerText = '$' + parseInt(token);
				
				lastWallc = objc;
				drawWallSection(newSection); 
			}
		}
    }
    // erase any walls the mouse touches
    if (destroyBtn && mouseStatusDown) {
        for (let i=0; i<walls.length; i++) {
            if (getDistance(objc, walls[i].start) < (walls[i].getLength()+2) && getDistance(objc, walls[i].end) < (walls[i].getLength()+2)) {
				token += parseInt(walls[i].getLength() * walls[i].unitCost * walls[i].health / 100 / 2);
				document.getElementById('token0').innerText = '$' + parseInt(token);
				walls.splice(i, 1);
                return;
            }
        }
        updateScreen();
    }
    // move the canvas
    if (!drawButton && !destroyBtn && !scaleButton && mouseStatusDown) {
        CanvasOffsetX += mouseX - oldmouseX;
        CanvasOffsetY -= mouseY - oldmouseY;
        drawNewGrid = true;
        updateScreen();
    }
}

/** get mousewheel movements
    @param {event} event - the event
*/
function mousewheel(event) {
    if (event.clientY < topBarMargin) {
        return;
    }
    if (event.clientX > W-sideBarMargin) {
        return;
    }
    let oMouse = canvasToObj({x: mouseX, y: mouseY});
    let delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)));
    scale = Math.min(1, Math.max(0.01, scale*(1+0.05*parseFloat(delta))));
    let cnMouse = objToCanvas(oMouse);
    CanvasOffsetX += mouseX - cnMouse.x;
    CanvasOffsetY -= mouseY - cnMouse.y;
    drawNewGrid = true;
    updateScreen();
}

/** wait for keypush
@param {event} evt - the event
*/
function keyPush(evt) {
    if (evt.ctrlKey && evt.code === 'KeyZ') {
		token += parseInt(walls[walls.length-1].getLength() * walls[walls.length-1].unitCost * walls[walls.length-1].health / 100 / 2);
		document.getElementById('token0').innerText = '$' + parseInt(token);
        walls.splice(walls.length-1, 1);
        updateScreen(walls);
    }
    switch (evt.keyCode) {
        case 27:
        menuBtn();
    }
}

let modal = document.getElementById('helpInfo');
function displayHelp(){
	modal.style.display = 'block';
	paused = true;
}
function closeHelp(){
	modal.style.display = 'none';
	paused = false;
	simulate();
}

let infomodal = document.getElementById('gameInfo');
function displayInfo(text){
	document.getElementById('infoP').innerText = text;
	infomodal.style.display = 'block';
}
function closeInfo(){
	infomodal.style.display = 'none';
}
window.onclick = function(event) {
    if (event.target == infomodal) {
        infomodal.style.display = "none";
    }
}


/** draw a wall
    @param {object[]} wall - single wall section
*/
function drawWallSection(wall) {
	if (graphics.shadow) {
		ctx2.shadowColor = '#111';
		ctx2.shadowBlur = 4;
		ctx2.shadowOffsetX = 0;
		ctx2.shadowOffsetY = 0;
	}
		
        ctx2.beginPath();
        let ca = objToCanvas({x: wall.start.x, y: wall.start.y});
        ctx2.moveTo(ca.x, ca.y);
        let cb = objToCanvas({x: wall.end.x, y: wall.end.y});
        ctx2.lineTo(cb.x, cb.y);
        ctx2.lineWidth = 2 * scale*epsilonScale;
        ctx2.strokeStyle = '#CCC';
        ctx2.stroke();
		
		if (wall.health < 100) {
			ctx2.beginPath();
			let ca = objToCanvas({x: wall.start.x, y: wall.start.y});
			ctx2.moveTo(ca.x, ca.y);
			let cb = objToCanvas({x: wall.end.x, y: wall.end.y});
			ctx2.lineTo(cb.x, cb.y);
			ctx2.lineWidth = 40 * scale;
			ctx2.strokeStyle = '#00ff00';
			if (wall.health < 80) {
				ctx2.strokeStyle = '#90ff00';
			}
			if (wall.health < 60) {
				ctx2.strokeStyle = '#fcff00';
			}
			if (wall.health < 40) {
				ctx2.strokeStyle = '#ffa200';
			}
			if (wall.health < 20) {
				ctx2.strokeStyle = '#ff0000';
			}
			ctx2.stroke();
		}
		
		
		ctx2.beginPath();
		ctx2.arc(ca.x,ca.y, 2 * scale*epsilonScale, 0 , 2*Math.PI);
		ctx2.lineWidth = 40 * scale;
		ctx2.fillStyle = '#AAA';
		ctx2.fill();
		
		ctx2.beginPath();
		ctx2.arc(ca.x,ca.y, 2 * scale*epsilonScale, 0 , 2*Math.PI);
		ctx2.lineWidth = 40 * scale;
		ctx2.strokeStyle = '#CCC';
		ctx2.stroke();
		
		ctx2.beginPath();
		ctx2.arc(cb.x,cb.y, 2 * scale*epsilonScale, 0 , 2*Math.PI);
		ctx2.lineWidth = 40 * scale;
		ctx2.fillStyle = '#AAA';
		ctx2.fill();
		
		ctx2.beginPath();
		ctx2.arc(cb.x,cb.y, 2 * scale*epsilonScale, 0 , 2*Math.PI);
		ctx2.lineWidth = 40 * scale;
		ctx2.strokeStyle = '#CCC';
		ctx2.stroke();
		if (graphics.shadow) {
			ctx2.shadowBlur = 0;
		}
}

/** draw all walls
    @param {object[]} walls - all walls on the map
*/
function drawWalls(walls) {
    for (let i=0; i<walls.length; i++) {
        drawWallSection(walls[i]);
    }
}

/** draw a raider
    @param {object[]} raider - single raider
*/
function drawOneEnemy(raider) {
	let unitimg;
	if ((timecountsmall % 10 ) < 6){
		unitimg = raider.imageA;
	} else {
		unitimg = raider.imageB;
	}
	let cxy = objToCanvas(raider.position);
    if (canvas2.getContext) {
        let x2 = cxy.x;
        let y2 = cxy.y;
        let width2 = unitimg.width*5*scale;
        let height2 = unitimg.height*5*scale;
        ctx.translate(x2, y2);
        ctx.rotate(-Math.atan2(-raider.vx, raider.vy));
		ctx.drawImage(unitimg, -width2 / 2, -height2 / 2, width2, height2);
        ctx.rotate(Math.atan2(-raider.vx, raider.vy));
        ctx.translate(-x2, -y2);
    }
}

/** draw all raiders
    @param {object[]} raiders - all raiders on the map
*/
function drawEnemy(raiders) {
    for (let i=0; i<raiders.length; i++) {
        drawOneEnemy(raiders[i]);
    }
}

/** draw a castle
    @param {object[]} castle - one castle
*/
function drawCastle(castle) {
	let cxy = objToCanvas(castle.position);
	/*
	ctx2.beginPath();
		ctx2.arc(cxy.x,cxy.y, castle.hitbox*scale*epsilonScale, 0 , 2*Math.PI);
		ctx2.lineWidth = 40 * scale;
		ctx2.fillStyle = '#9d9b87';
		ctx2.fill();
	*/
	
	let png;
	png = castle.imageA;
	let width2 = png.width*5*scale;
	let height2 = png.height*5*scale;
	ctx2.drawImage(png, cxy.x-width2/2, cxy.y-height2/2, width2, height2);
	
    ctx2.font = '16px Trebuchet MS';
	let healthR = castle.health/castle.healthBar;
	ctx2.fillStyle = '#00ff00';
    if (healthR < 0.8) {
		ctx2.fillStyle = '#90ff00';
	}
	if (healthR < 0.6) {
		ctx2.fillStyle = '#fcff00';
	}
	if (healthR < 0.4) {
		ctx2.fillStyle = '#ffa200';
	}
	if (healthR < 0.2) {
		ctx2.fillStyle = '#ff0000';
	}
	let text = parseInt(castle.health.toString());
	ctx2.shadowColor='black';
	ctx2.shadowBlur=7;
    ctx2.fillText(text, cxy.x-30*scale-11, cxy.y-800*scale);
	ctx2.shadowBlur=0;
}

/** draw all castles
    @param {object[]} castles - all castles on the map
*/
function drawCastles(castles) {
    for (let i=0; i<castles.length; i++) {
        drawCastle(castles[i]);
    }
}

function upgradeCastle(id){
	uncheckAllButtons();
	firstUpgrade = true;
	let tp = castles[id].nextType;
	if (tp == 'none') {
		displayInfo('Cannot upgrade further');
	} else {
		let newCastle = new Castle(tp);
		if (token >= newCastle.cost) {
			token -= newCastle.cost;
			document.getElementById('token0').innerText = '$' + parseInt(token).toString();
			newCastle.position = {x: castles[id].position.x, y: castles[id].position.y};
			castles[id] = newCastle;
			displayInfo('Upgraded to '+ newCastle.name);
		}
		else {
			displayInfo('You need $'+ newCastle.cost.toString() + ' to upgrade the castle.');
		}
	}
}


/** draw the grid on the canvas
*/
function drawGrid() {
    ctxbg.clearRect(0, 0, W, H);
    /*
    ctxbg.fillStyle = '#F0EDEE';
    ctxbg.beginPath();
    ctxbg.rect(0,0,W,H);
    ctxbg.closePath();
    ctxbg.fill();
    */

    let o00 = canvasToObj({x: 0, y: 0});
    let oWH = canvasToObj({x: W, y: H});
    let corigin = objToCanvas({x: 0, y: 0});

    if (corigin.x <=W && corigin.x >=0) {
        ctxbg.beginPath();
        ctxbg.moveTo(corigin.x, 0);
        ctxbg.lineTo(corigin.x, H);
        ctxbg.lineWidth = 1;
        ctxbg.strokeStyle = '#000000';
        ctxbg.stroke();
    }
    if (corigin.y <=H && corigin.y >=0) {
        ctxbg.beginPath();
        ctxbg.moveTo(0, corigin.y);
        ctxbg.lineTo(W, corigin.y);
        ctxbg.lineWidth = 1;
        ctxbg.strokeStyle = '#000000';
        ctxbg.stroke();
    }

    let gridSize = 0.001;
    let maxgridsize = W/20/(scale*epsilonScale);
    for (let c = 0; gridSize <= maxgridsize; c++) {
        if (c % 3 == 1) { // alternate 2, 5, 10
            gridSize *= 1.25;
        }
        gridSize *= 2;
    }
    let textSize = Math.min(4, parseInt(scale*10).toString().length-1);
    for (let i = Math.round(o00.x/gridSize);
            i <= Math.round(oWH.x/gridSize); i++) {
        let pt = objToCanvas({x: gridSize*i, y: 0});
        // drawLabel
        let textY = Math.min(H-5, Math.max(corigin.y, 20+topBarMargin));
        ctxbg.font = '16px Consolas';
        ctxbg.fillStyle = '#111111';
        ctxbg.fillText((gridSize*i).toFixed(textSize), pt.x+1, textY-3);
        // drawGrid
        ctxbg.beginPath();

        ctxbg.moveTo(pt.x, 0);
        ctxbg.lineTo(pt.x, H);
        ctxbg.lineWidth = 0.3;
        ctxbg.strokeStyle = '#000000';
        ctxbg.stroke();
    }
    for (let i = Math.round(oWH.y/gridSize);
            i <= Math.round(o00.y/gridSize); i++) {
        let pt = objToCanvas({x: 0, y: gridSize*i});
        // drawLabel
        let textX = Math.min(W-sideBarMargin-45, Math.max(corigin.x, 0));
        ctxbg.font = '16px Consolas';
        ctxbg.fillStyle = '#111111';
        ctxbg.fillText((gridSize*i).toFixed(textSize), textX+1, pt.y-3);
        // drawGrid
        ctxbg.beginPath();

        ctxbg.moveTo(0, pt.y);
        ctxbg.lineTo(W, pt.y);
        ctxbg.lineWidth = 0.3;
        ctxbg.strokeStyle = '#000000';
        ctxbg.stroke();
    }
}

function generateNewEnemy() {
	let nType 
	if (season < randomRaider.length){
		nType = randomRaider[season][Math.floor(Math.random() * randomRaider[season].length)];
	} else {
		nType = randomRaider[randomRaider.length-1][Math.floor(Math.random() * randomRaider[randomRaider.length-1].length)];
	}
	
	let newraider = new Raider(nType);
	let nx = Math.floor(Math.random() * 800) - 400;
	if (nx < 200 && nx > 0) {
		nx += 200;
	}
	if (nx > -200 && nx < 0) {
		nx -= 200;
	}
	let ny = Math.floor(Math.random() * 800) - 400;
	if (ny < 200 && ny > 0) {
		ny += 200;
	}
	if (ny > -200 && ny < 0) {
		ny -= 200;
	}
	nx += castles[0].position.x;
	ny += castles[0].position.y;
	newraider.position.x = parseInt(nx);
	newraider.position.y = parseInt(ny);
	newraider.destination.x = castles[0].position.x;
	newraider.destination.y = castles[0].position.y;
	newraider.waypoint.x = castles[0].position.x;
	newraider.waypoint.y = castles[0].position.y;
	let xdis = newraider.destination.x - newraider.position.x;
	let ydis = newraider.destination.y - newraider.position.y;
	let dis = Math.sqrt(xdis*xdis + ydis*ydis);
	newraider.vx = newraider.speed/fps*xdis/dis;
	newraider.vy = newraider.speed/fps*ydis/dis;
	raiders.push(newraider);
}

/** refresh all changed items on the canvas
*/
function updateScreen() {
    ctx.clearRect(0, 0, W, H);
    ctx2.clearRect(0, 0, W, H);
	drawMap();
	drawEnemy(raiders);
	drawWalls(walls);
	drawCastles(castles);
	
    if (drawNewGrid) {
        drawNewGrid = false;
        if (!paused) {

        }
    }
}

function changeSeason(){
	
	season += 1;
	if (season < 5){
		displayInfo(seasonmessage[season]);
	}
}

function deadEnd(as, ae, bs, be, los){
	if (intersect(as, ae, bs, be)){
		if (getDistance(bs, {x: (as.x + ae.x)/2, y: (as.y + ae.y)/2}) < los) {
			return true;
		}
	}
	return false;
}

function drawLine(adot, bdot){
	let add = objToCanvas(adot);
	let bdd = objToCanvas(bdot);
	ctxbg.beginPath();
    ctxbg.moveTo(add.x, add.y);
    ctxbg.lineTo(bdd.x, bdd.y);
    ctxbg.lineWidth = 2;
    ctxbg.strokeStyle = '#555';
    ctxbg.stroke();
}

function rotateLine(lineStart, lineEnd, degree) {
	degree /= 57.3;
	let dist = getDistance(lineStart, lineEnd);
	let ang = Math.atan2(lineEnd.y-lineStart.y, lineEnd.x-lineStart.x);
	ang += degree;
	return {x: lineStart.x + dist*Math.cos(ang), y: lineStart.y + dist*Math.sin(ang)};
}

function findDirection(id) {
	//castles[0].position.x
	let xsight = raiders[id].lineOfSight* raiders[id].vx/raiders[id].speed;
	let ysight = raiders[id].lineOfSight*raiders[id].vy/raiders[id].speed;
	let rend = {x: raiders[id].position.x + xsight, y: raiders[id].position.y + ysight};
	//drawLine(raiders[id].position, rend);
	if (walls.length > 0) {
		let dr = true;
		for (let i = 0; i < walls.length; i++) {
			if (walls[i].health > 80 && intersect(raiders[id].position, raiders[id].destination, walls[i].start, walls[i].end)) {
				dr = false;
				break;
			}
		}
		for (let i = 0; i < walls.length; i++) {
			let wallsta = {x: 1.5 * walls[i].start.x - 0.5 * walls[i].end.x, y: 1.5 * walls[i].start.y - 0.5 * walls[i].end.y};
			let wallend = {x: 1.5 * walls[i].end.x - 0.5 * walls[i].start.x, y: 1.5 * walls[i].end.y - 0.5 * walls[i].start.y};
			if (intersect(raiders[id].position, raiders[id].destination, wallsta, wallend)) {
				dr = false;
			}
			if (intersect(raiders[id].position, rend, wallsta, wallend)) {
				let rangle = 0;
				while (rangle < 60) {
					rangle += 10;
					let leftend = rotateLine(raiders[id].position, rend, -rangle);
					let rigtend = rotateLine(raiders[id].position, rend, rangle);
					if (!intersect(wallsta, wallend, raiders[id].position, leftend)) {
						raiders[id].waypoint.x = leftend.x;
						raiders[id].waypoint.y = leftend.y;
						break;
					}
					if (!intersect(wallsta, wallend, raiders[id].position, rigtend)) {
						raiders[id].waypoint.x = rigtend.x;
						raiders[id].waypoint.y = rigtend.y;
						break;
					}
				}
				break;
			}
		}
		if (dr || raiders[id].totalAngle > 6.283) {
			raiders[id].waypoint.x = raiders[id].destination.x;
			raiders[id].waypoint.y = raiders[id].destination.y;
		}
	}
		let xdis = raiders[id].waypoint.x - raiders[id].position.x;
		let ydis = raiders[id].waypoint.y - raiders[id].position.y;
		let dis = Math.sqrt(xdis*xdis + ydis*ydis);
		let spdangle = Math.atan2(raiders[id].vy, raiders[id].vx);
		let disangle = Math.atan2(ydis, xdis);
		
		if (disangle-spdangle <= -Math.PI) {
			spdangle -= 2 * Math.PI;
		} else if (disangle-spdangle >= Math.PI) {
			spdangle += 2 * Math.PI;
		}
		
		if (spdangle < disangle-4*raiders[id].steering) {
			spdangle = Math.min(disangle, spdangle + raiders[id].steering);
			raiders[id].totalAngle += raiders[id].steering;
		} else if (spdangle > disangle+4*raiders[id].steering) {
			spdangle = Math.max(disangle, spdangle - raiders[id].steering);
			raiders[id].totalAngle += raiders[id].steering;
		}
		console.log(raiders[id].totalAngle);
		raiders[id].vx = raiders[id].speed*Math.cos(spdangle);
		raiders[id].vy = raiders[id].speed*Math.sin(spdangle);
}

/** refresh time counter
*/
function updateTime() {
	timecountsmall += 1;
	if (timecountsmall % 60 == 0) {
		timecountlarge += 1;
		timecountsmall = 0;
		document.getElementById('time0').innerText = timecountlarge;
	}
}

/** refresh all raiders on the canvas
	generate new raiders based on set interval
*/
function updateSimulation() {
	if (timecountlarge % 2 == 1 && timecountsmall == 0) {
		//helf message
		if (timecountlarge > 40 && firstUpgrade == false) {
			displayInfo('Try clicking the ♖ button, then click on the castle to upgrade!');
			firstUpgrade = true;
		}
		if (timecountlarge > 20 && firstWall == false) {
			displayInfo('Try clicking the first button to build some walls');
			firstWall = true;
		}
		let productivity = 0;
		//harvest
		let multiplier = 1;
		if (season % 4 == 0) {
			multiplier = 2;
		}
		for (let i=0; i<castles.length; i++){
			castles[i].health = Math.min(castles[i].healthBar, castles[i].health + 0.0005 * castles[i].healthBar);
			productivity += castles[i].wealth;
		}
		token += productivity * multiplier;
		document.getElementById('token0').innerText = '$' + parseInt(token).toString();
	}
	if (timecountlarge % enemyInterval == enemyInterval-1 && timecountsmall == 0) {
		if (timecountlarge % 60 == 59 && timecountsmall == 0){
			changeSeason(timecountlarge);
		}
		generateNewEnemy();
	}
	for (let i=0; i<raiders.length; i++){
		if (raiders[i].health < 0) {
			raiders.splice(i, 1);
		}
	}
	ctxbg.clearRect(0, 0, W, H);
	for (let i=0; i<raiders.length; i++){
		findDirection(i);
		raiders[i].position.x += raiders[i].vx/fps;
		raiders[i].position.y += raiders[i].vy/fps;

			raiders[i].waypoint.x = castles[0].position.x;
			raiders[i].waypoint.y = castles[0].position.y;

		
		for (let j=0; j<walls.length; j++){
			let rdc = raiders[i].position;
			if (dotLineDistance(rdc, walls[j].start, walls[j].end) < raiders[i].range && getDistance(rdc, walls[j].start) < (walls[j].getLength()+2) && getDistance(rdc, walls[j].end) < (walls[j].getLength()+2)) {
				walls[j].getHit(raiders[i]);
				raiders[i].getHit(walls[j]);
			}
			if (raiders[i].health < 0){
				break;
			}
		}
		if (getDistance(castles[0].position, raiders[i].position) < castles[0].hitbox + raiders[i].range) {
			castles[0].getHit(raiders[i]);
			raiders[i].getHit(castles[0]);
		}
	}
	for (let i=0; i<walls.length; i++){
		if (walls[i].health < 0) {
			walls.splice(i, 1);
		}
	}
	
}

/** reset every button
*/
function uncheckAllButtons() {
    $('html,body').css('cursor', 'move');
    drawButton = false;
    resetButton = false;
    destroyBtn = false;
    scaleButton = false;
	ungradeCastleBtn = false;
}

/** move button
*/
function moveButton() {
    uncheckAllButtons();
}

/** move button
*/
function zoomButton() {
    let before = scaleButton;
    uncheckAllButtons();
    if (before) {
        $('html,body').css('cursor', 'move');
    } else {
        $('html,body').css('cursor', 'zoom-in');
    }
    scaleButton = !before;
}

function menuBtn() {
    uncheckAllButtons();
	paused = true;
	closeHelp();
	closeInfo();
    openNav();
}

/** draw button
*/
function drawWallButton() {
	firstWall = true;
    let before = drawButton;
        uncheckAllButtons();
    if (before) {
        $('html,body').css('cursor', 'move');
    } else {
        $('html,body').css('cursor', 'url(images/buildBtn.png), default');
    }
    drawButton = !before;
}

/** erase button
*/
function destroyWallButton() {
    let before = destroyBtn;
    uncheckAllButtons();
    if (before) {
        $('html,body').css('cursor', 'move');
    } else {
        $('html,body').css('cursor', 'url(images/destroyBtn.png), default');
    }
    destroyBtn = !before;
}

function upgradeCastleButton() {
    let before = ungradeCastleBtn;
    uncheckAllButtons();
    if (before) {
        $('html,body').css('cursor', 'move');
    } else {
        $('html,body').css('cursor', 'url(images/castleBtn.png), default');
    }
    ungradeCastleBtn = !before;
}

/** start button
*/
function start() {
    uncheckAllButtons();
    paused = !paused;
    if (!paused) {
        simulate();
    }
}

function start2() {
	paused = false;
	if (firstStart){
		restart();
		document.getElementById('startBtn2').innerText = 'Continue';
		displayHelp();
		firstStart = false;
	}
    simulate();
	closeNav();
}

function restart2() {
    uncheckAllButtons();
	restart();
	start();
	if (firstStart){
		displayHelp();
		firstStart = false;
	}
	closeNav();
	

}

/** restart the game
*/
function restart() {
	season = 0;
	token = 100;
	timecountlarge = 0;
	timecountsmall = 0;
    scale = 0.05; 
    CanvasOffsetX = W * 0.5 - homeX * epsilonScale;
    CanvasOffsetY = H * 0.5 - homeY * epsilonScale;
	drawMap();
    updateScreen();
	castles = [];
	raiders = [];
	walls = [];
	let newCastle = new Castle('CC0');
	castles.push(newCastle);
	document.getElementById('token0').innerText = '$' + parseInt(token).toString();
    updateScreen();
    paused = true;
}

/** reset to start
*/
function reset() {
    let before = resetButton;
    restart();
    if (before) {
        $('html,body').css('cursor', 'move');
    } else {
        $('html,body').css('cursor', 'default');
    }
    resetButton = !before;
}

const input = document.querySelector('#loadlocal');

input.addEventListener('change', () => {
  const file = input.files.item(0);
  fileToText(file, (text) => {
    parseLoadFile(text);
  });
});

function fileToText(file, callback) {
  const reader = new FileReader();
  reader.readAsText(file);
  reader.onload = () => {
    callback(reader.result);
  };
}

function save(content, fileName, mime) {
  const blob = new Blob([content], {
    tipe: mime
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

/** get the distance between two nodes
    @param {object} a - the first node
    @param {object} b - the second node
    @return {float}
*/
function getDistance(a, b) {
    return Math.sqrt((a.x-b.x) * (a.x-b.x) + (a.y-b.y) * (a.y-b.y));
}

/** get the dot product of two vectors
    @param {object} lineAStart - the first node of first line
    @param {object} lineAEnd - the second node of first line
    @param {object} lineBStart - the first node of second line
    @param {object} lineBEnd - the second node of second line
    @return {float}
*/
function dotProduct(lineAStart, lineAEnd, lineBStart, lineBEnd) {
    let lineAX = lineAEnd.x - lineAStart.x;
    let lineAY = lineAEnd.y - lineAStart.y;
    let lineBX = lineBEnd.x - lineBStart.x;
    let lineBY = lineBEnd.y - lineBStart.y;
    return lineAX*lineBX + lineAY*lineBY;
}

/** check if two lines intersect
    @param {object} lineAStart - the first node of first line
    @param {object} lineAEnd - the second node of first line
    @param {object} lineBStart - the first node of second line
    @param {object} lineBEnd - the second node of second line
    @return {boolean}
*/

function intersect(lineAStart, lineAEnd, lineBStart, lineBEnd) {
    let det = (lineAEnd.x - lineAStart.x) * (lineBEnd.y - lineBStart.y) - (lineBEnd.x - lineBStart.x) * (lineAEnd.y - lineAStart.y);
    if (det === 0) {
        return false;
    } else {
        let lambda = ((lineBEnd.y - lineBStart.y) * (lineBEnd.x - lineAStart.x) + (lineBStart.x - lineBEnd.x) * (lineBEnd.y - lineAStart.y)) / det;
        let gamma = ((lineAStart.y - lineAEnd.y) * (lineBEnd.x - lineAStart.x) + (lineAEnd.x - lineAStart.x) * (lineBEnd.y - lineAStart.y)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    }
}



 /** find the shortest distance from dot to line
     brief Reflect point p along line through points p0 and p1
     * @param {object} p0 - dot
     * @param {object} p1 - first point of line
     * @param {object} p2 - second point of line
     * @return {object}
     */
function dotLineDistance(p0, p1, p2) {
    // ablsolute distance between dot and line
    let vertDistance = Math.abs(
    (p2.y-p1.y)*p0.x - (p2.x-p1.x)*p0.y + p2.x*p1.y - p2.y*p1.x)
    /Math.sqrt((p2.y-p1.y) * (p2.y-p1.y) + (p2.x-p1.x) * (p2.x-p1.x));
    // let dis0 = getDistance(p0, p1);
    // let dis1 = getDistance(p0, p2);
    return vertDistance;
}


 /** mirror two dots
     brief Reflect point p along line through points p0 and p1
     * @param {object} p - point to reflect
     * @param {object} p0 - first point for reflection line
     * @param {object} p1 - second point for reflection line
     * @return {object}
     */
function mirrorPoint(p, p0, p1) {
    let dx = p1.x - p0.x;
    let dy = p1.y - p0.y;
    let a = (dx * dx - dy * dy) / (dx * dx + dy * dy);
    let b = 2 * dx * dy / (dx * dx + dy * dy);
    let x = a * (p.x - p0.x) + b * (p.y - p0.y) + p0.x;
    let y = parseFloat(b) * parseFloat(p.x - p0.x) -
        parseFloat(a) * parseFloat(parseFloat(p.y) - p0.y) + parseFloat(p0.y);
    return {x: x, y: y};
}

/** mirror two vectors
     Reflect vector p along line through points p0 and p1
     * @param {object} v - vector to reflect
     * @param {object} p0 - first point for reflection line
     * @param {object} p1 - second point for reflection line
     * @return {object}
*/
function mirrorVector(v, p0, p1) {
    let startP = {x: 0, y: 0};
    let endP = {x: v.x, y: v.y};
    let mstartP = mirrorPoint(startP, p0, p1);
    let mendP = mirrorPoint(endP, p0, p1);
    return {x: mendP.x-mstartP.x, y: mendP.y-mstartP.y};
}

 /** the function to draw a map based on a given seed
 */
function drawMap() {
	
	ctxbg.fillStyle = backgroundcolors[season % 4];
	ctxbg.fillRect(0, 0, W, H);
}

function gameover(){
	paused = true;
	if (timecountlarge > bestscore){
		bestscore = timecountlarge;
	}
	
	firstStart = false;
	document.getElementById('startBtn2').innerText = 'Start';
	document.getElementById('navinfo').innerText = 'Score: ' + timecountlarge + '\nBest: ' + bestscore;
	openNav();
}

 /** do one frame in the simulation
 */
function simulate() {
	updateTime();
	updateSimulation();
    updateScreen();
	if (castles[0].health<0) {
		gameover();
	}
	
    if (!paused) {
        window.requestAnimationFrame(simulate);
    }
}


 /** start the simulation
 */
function gameStart() {
	restart();
    simulate();
}
setup();
gameStart();


function onReady(callback) {
    let intervalID = window.setInterval(checkReady, 1000);
    function checkReady() {
        if (document.getElementsByTagName('body')[0] !== undefined) {
            window.clearInterval(intervalID);
            callback.call(this);
        }
    }
}
function loaded() {
    initaudio();
    document.getElementById('loaderbg').style.display = 'none';
	document.getElementById('loader').style.display = 'none';
	openNav();
};

