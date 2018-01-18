/* Skateboarding app JS*/
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
let trail = [];
let trails = [];
let walls = [];
let castles = [];
let raiders = [];
let mouseStatusDown = false;
let drawNewGrid = true;
let equation = 'y=x * 0.5';
let scaleBeginMouse = {x: -1, y: -1};

let epsilon = 0.05;
let epsilonScale = 50;

let gravity = -9.8;
let fps = 60;
let debugMode = false;
let speedVectorContant = 2;
let collisionFriction = 0;

let timecountsmall = 0;
let timecountlarge = 0;

let enemyInterval = 4;
let token = 100;
let bestscore = 0;
let sound = 0.01;
let soundlevel = 40;

let season = 0;
let seasonmessage = [
					'Its autumn now',
					'Freezing Winter comes, cost of wall construction doubles.', 
					'Spring comes, a new type of raider occurs.',
					'Summer comes, a new type of raider occurs.',
					'Autumn comes, a good harvest doubles the income of the castle'
					];
let backgroundcolors = [
					'#d1a663',
					'#e0c8a3',
					'#b1c579',
					'#c1b56e'
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
				['Sabre Cavalry', 'CR0', 18, 10, 5, 2, 5, CR0A, CR0B],
				['Light Axe Infantry', 'IR0', 7, 20, 2, 3, 2, IR0A, IR0B],
				['Light Sword Infantry', 'IR1', 7, 20, 3, 5, 2, IR1A, IR1B],
				['Spear Cavalry', 'CR1', 20, 10, 10, 2, 6, CR1A, CR1B]
				 ];

/**
 * Creates a raider.
 *
 * @constructor
 * @author: yanlin
 * @this {Rastle}
 */
function Raider(tp) {
	this.xc = 0;
	this.yc = 0;
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
    // put a new node to the trail
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
    // erase any trails the mouse touches
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
		ctx2.shadowColor = '#111';
		ctx2.shadowBlur = 4;
		ctx2.shadowOffsetX = 0;
		ctx2.shadowOffsetY = 0;
		
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
		
		ctx2.shadowBlur = 0;
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
	let cxy = objToCanvas({x: raider.xc, y: raider.yc});
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
	let cxy = objToCanvas({x: castle.position.x, y: castle.position.y});
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
	newraider.xc = parseInt(nx);
	newraider.yc = parseInt(ny);
	raiders.push(newraider);
}

/** refresh all changed items on the canvas
*/
function updateScreen() {
    ctx.clearRect(0, 0, W, H);
    ctx2.clearRect(0, 0, W, H);

    /*
    let my_gradient=ctx.createLinearGradient(0,0,0,H);
    my_gradient.addColorStop(0,'#f8effa');
    my_gradient.addColorStop(1,'#9ebbe1');
    ctx.fillStyle=my_gradient;
    ctx.fillRect(0,0,W,H);
    */
	/*
    if (!paused) {
        CanvasOffsetX -= parseInt(Math.min(1, skateBoarder.getSpeed()/10)
        * (scale*epsilonScale) * (skateBoarder.vx/fps));
        CanvasOffsetY -= parseInt(Math.min(1, skateBoarder.getSpeed()/10)
        * (scale*epsilonScale) * (skateBoarder.vy/fps));
        drawNewGrid = true;
    }
	*/
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
	for (let i=0; i<raiders.length; i++){
		let xdis = castles[0].position.x - raiders[i].xc;
		let ydis = castles[0].position.y - raiders[i].yc;
		let dis = Math.sqrt(xdis*xdis + ydis*ydis);
		raiders[i].vx = raiders[i].speed/fps*xdis/dis;
		raiders[i].vy = raiders[i].speed/fps*ydis/dis;
		raiders[i].xc += raiders[i].vx;
		raiders[i].yc += raiders[i].vy;
		
		for (let j=0; j<walls.length; j++){
			let rdc = {x: raiders[i].xc, y: raiders[i].yc};
			if (dotLineDistance(rdc, walls[j].start, walls[j].end) < raiders[i].range && getDistance(rdc, walls[j].start) < (walls[j].getLength()+2) && getDistance(rdc, walls[j].end) < (walls[j].getLength()+2)) {
				walls[j].getHit(raiders[i]);
				raiders[i].getHit(walls[j]);
			}
			if (raiders[i].health < 0){
				break;
			}
		}
		if (getDistance(castles[0].position, {x: raiders[i].xc, y: raiders[i].yc}) < castles[0].hitbox + raiders[i].range) {
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

/** convert the trails and save files to text

    @return {String} The text data of the save file
*/
function parseSaveFile() {
    let txt = '<trail>';
    for (let i=0; i<trails.length; i++) {
        for (let j=1; j<trails[i].length; j++) {
            txt += trails[i][j].x + ' ' + trails[i][j].y + '|';
        }
        txt += '<trail>';
    }
    return txt;
}

/** convert the save files to trails
    @param {String} The text data of the save file
*/
function parseLoadFile(txt) {
    let lines = txt.split('<trail>');
    trails = [];
    for (let i=1; i<lines.length-1; i++) {
        let line = lines[i].split('|');
        trail = [];
        for (let j=0; j<line.length-1; j++) {
            let point = line[j].split(' ');
            trail.push({x:parseFloat(point[0]), y:parseFloat(point[1])});
        }
        trails.push(trail);
        trail = [];
    }
    if (trails.length>0) {
        updateScreen();
    }
}


/** user login
*/
function userLogin() {
    uncheckAllButtons();
	let error = false;
    let cloud = new CloudSaver();
    let callback = function(data) {
		error = false;
	};
    let errorBack = function(data) {
		error = true;
	};
    cloud.loginPopup(callback, errorBack);
    if (error) {
        alert('The email or password is incorrect');
        return;
    }
    // try to get user ID
    cloud.getUser(callback, errorBack);
    if (error) {
        alert('Please log in');
    } else {
        username = data.username;
        userID = data.userID;
    }
}

/** save the trails drawn and spawn location
*/
function saveGameButton() {
    uncheckAllButtons();
	let text = parseSaveFile();
	let filename = 'savefile.txt';
	let pom = document.createElement('a');
		pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
		pom.setAttribute('download', filename);
		if (document.createEvent) {
			let event = document.createEvent('MouseEvents');
			event.initEvent('click', true, true);
			pom.dispatchEvent(event);
		}
		else {
			pom.click();
		}
    /*
    let dt = new Date();
    dt.getDate();
    let pName;
    let saveName = prompt('Please enter the name of the save file:',
    'Save file ' + (parseInt(dt.getMonth())+1).toString() +
    '/' + dt.getDate());

    if (saveName == null || saveName == '') {
        pName = 'Invalid name';
        return;
    } else {
        pName = saveName;
    }
    alert(pName);
    let cloud = new CloudSaver();
    let savefile;
    let callback;
    let errorBack;
    cloud.saveFile(savefile, callback, errorBack);
    if (errorBack) {
        alert('Unable to save the file');
    }
    let projectID;
    cloud.loadProject(projectID, callback, errorBack);
    if (errorBack) {
        cloud.createProject(
        pName, applicationID, dataID, imgID, callback, errorBack);
        projectID = callback;
    } else {
        cloud.updateProject(
        projectID, pName, applicationID, dataID, imgID, callback, errorBack);
    }
    */
}

/** load the trails drawn and spawn location
*/
function loadGameButton() {
    uncheckAllButtons();
	
	let error = false;
    let cloud = new CloudSaver();
    let callback = function(data) {
		error = false;
	};
    let errorBack = function(data) {
		error = true;
	};

    // try to get user ID
    cloud.getUser(callback, errorBack);
    if (error) {
        alert('Please log in');
    } else {
        username = data.username;
        userID = data.userID;
    }
    console.log(username);

    cloud.listProject(userID, callback, errorBack);
    if (error) {
        alert('No saved files');
        return;
    } else {
        console.log(data);
    }
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

/** update the player position based on speed and gravity.
    @param {Skateboarder} obj the player in game
*/
function updatePlayer(obj) {
    obj.x += obj.vx/fps;
    obj.y += obj.vy/fps;
    obj.vy += gravity/fps;
    obj.angle += obj.angularV/fps;
    obj.angularV *= obj.angularF;
    // auto center
    if (obj.hit == 0) {
        obj.angularV += 0.05*(0-obj.angle);
    }
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
    let lineAX = lineAEnd.x - lineAStart.x;
    let lineAY = lineAEnd.y - lineAStart.y;
    let lineBX = lineBEnd.x - lineBStart.x;
    let lineBY = lineBEnd.y - lineBStart.y;
    let s = (-lineAY * (lineAStart.x - lineBEnd.x) + lineAX * (lineAStart.y - lineBStart.y)) / (-lineBX * lineAY + lineAX * lineBY);
    let t = ( lineBX * (lineAStart.y - lineBStart.y) - lineBY * (lineAStart.x - lineBStart.x)) / (-lineBX * lineAY + lineAX * lineBY);
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return true; // Collision detected
    }
    return false; // No collision
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

 /** change the player status after collision
     * @param {Skateboarder} obj - the player
     * @param {objectp} lineStart - first point for reflection line
     * @param {object} lineEnd - second point for reflection line
     */
function collide(obj, lineStart, lineEnd) {
    obj.hit = 30;
    let mirroredVector = mirrorVector({x: obj.vx, y: obj.vy},
        lineStart, lineEnd);
    let intensity = Math.sqrt((mirroredVector.x-obj.vx) *
        (mirroredVector.x-obj.vx) + (mirroredVector.y-obj.vy) *
        (mirroredVector.y-obj.vy));
    let vertLine = {x: lineStart.y-lineEnd.y, y: lineEnd.x-lineStart.x};
    if (dotProduct( {x: 0, y: 0}, vertLine, {x: 0, y: 0}, mirroredVector) < 0) {
        vertLine.x = -vertLine.x;
        vertLine.y = -vertLine.y;
    }
    // new angle after collide with track
    let newangle = (Math.atan2(lineEnd.y-lineStart.y, lineEnd.x-lineStart.x)
        * 180 / Math.PI);

    let vertLen = Math.sqrt(vertLine.x * vertLine.x + vertLine.y * vertLine.y);
    if (dotLineDistance(obj, lineStart, lineEnd) < 0.3 * obj.collisionR) {
        console.log('crashed');
        obj.vx = mirroredVector.x *
        Math.max(0.5, 1-collisionFriction*intensity);
        obj.vy = mirroredVector.y *
        Math.max(0.5, 1-collisionFriction*intensity);
        obj.vx *= (1-obj.friction);
        obj.vy *= (1-obj.friction);
    } else {
        obj.vx += 1 * vertLine.x / vertLen;
        obj.vy += 1 * vertLine.y / vertLen;
    }
    // vertical friction
    if (!obj.onTrack) {
        obj.vx = obj.vx* (1 - 0 * vertLine.x / vertLen);
        obj.vy = obj.vy* (1 - 0 * vertLine.y / vertLen);
    }
    // if ( newangle<-90 || newangle>90){
    //    newangle += 180;
    //
    // newangle = newangle % 180;
    /*
    if ((Math.abs(newangle-obj.angle)%180) > 90){
        obj.valid = false;
        obj.friction = 0.5;
        obj.collisionR = 20;
    }*/
    obj.angularV += 3*(newangle-obj.angle);
    // obj.angle = newangle;
}

 /** check if the player will have collision with any trail
     * @param {Skateboarder} obj - the player
     */
function collision(obj) {
    if (trails.length == 0) return;
    let closestNode = {x: 0, y: 0, distance: W+H, i: -1, j: -1};
    let i;
    let j;
    for (i=0; i<trails.length; i++) {
        for (j=1; j<trails[i].length-1; j++) {
            let closestDistance = getDistance(obj, trails[i][j]);
            if (closestNode.distance >= closestDistance &&
                dotProduct(obj, {x: trails[i][j].x, y: trails[i][j].y},
                           obj, {x: obj.x + speedVectorContant * obj.vx,
                           y: obj.y + speedVectorContant * obj.vy}) >= 0) {
                closestNode.distance = closestDistance;
                closestNode.x = trails[i][j].x;
                closestNode.y = trails[i][j].y;
                closestNode.i = i;
                closestNode.j = j;
            }
        }
    }
    /*
    let speed = Math.sqrt(obj.x * obj.x + obj.y * obj.y);
    if (trails.length > 0){
        let thisTrail = trails[closestNode.i];
        let pos = closestNode.j;
        for (let offset=0; offset<2+parseInt(speed)/100; offset++){
            if (intersect(thisTrail[Math.max(0, pos-offset-1)],
                          thisTrail[Math.max(0, pos-offset)], obj,
                          {x:obj.x + speedVectorContant * obj.vx,
                          y:obj.y + speedVectorContant * obj.vy})){
                collide(obj, thisTrail[Math.max(0, pos-offset-1)],
                thisTrail[Math.max(0, pos-offset)]);
                return;
            }
            if (intersect(thisTrail[Math.min(thisTrail.length-1,
            pos+offset)],
                          thisTrail[Math.min(thisTrail.length-1,
                          pos+offset+1)], obj,
                          {x:obj.x + speedVectorContant * obj.vx,
                          y:obj.y + speedVectorContant * obj.vy})){
                collide(obj, thisTrail[Math.min(thisTrail.length-1,
                pos+offset)], thisTrail[Math.min(thisTrail.length-1,
                pos+offset+1)]);
                return;
            }
        }
    }
    */
    if (closestNode.j>0 && closestNode.i>=0) {
        if ((dotLineDistance(obj, trails[closestNode.i][closestNode.j-1],
             trails[closestNode.i][closestNode.j]) < obj.collisionR) &&
            getDistance(closestNode, {x: obj.x+obj.head.x, y: obj.y+obj.head.y})
            < Math.min(getDistance(closestNode, {x: obj.x+obj.frontWheel.x,
                                   y: obj.y+obj.frontWheel.y}),
                       getDistance(closestNode, {x: obj.x+obj.rearWheel.x,
                                   y: obj.y+obj.rearWheel.y}))) {
                collide(obj, trails[closestNode.i][closestNode.j-1],
                        trails[closestNode.i][closestNode.j]);
                obj.onTrack = true;
            return;
        }
    }
    obj.onTrack = false;
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

