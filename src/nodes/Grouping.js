/*
 * X3DOM JavaScript Library
 * http://www.x3dom.org
 *
 * (C)2009 Fraunhofer IGD, Darmstadt, Germany
 * Dual licensed under the MIT and GPL
 *
 * Based on code originally provided by
 * Philip Taylor: http://philip.html5.org
 */

// ### X3DGroupingNode ###
x3dom.registerNodeType(
    "X3DGroupingNode",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DBoundedNode,
        function (ctx) {
            x3dom.nodeTypes.X3DGroupingNode.superClass.call(this, ctx);

            this.addField_MFNode('children', x3dom.nodeTypes.X3DChildNode);
            // FIXME; add addChild and removeChild slots ?
        },
        {
            collectDrawableObjects: function (transform, drawableCollection, singlePath, invalidateCache, planeMask)
            {
                // check if multi parent sub-graph, don't cache in that case
                if (singlePath && (this._parentNodes.length > 1))
                    singlePath = false;

                // an invalid world matrix or volume needs to be invalidated down the hierarchy
                if (singlePath && (invalidateCache = invalidateCache || this.cacheInvalid()))
                    this.invalidateCache();

                // check if sub-graph can be culled away or render flag was set to false
                planeMask = drawableCollection.cull(transform, this.graphState(), singlePath, planeMask);
                if (planeMask <= 0) {
                    return;
                }

                var cnode, childTransform;

                if (singlePath) {
                    // rebuild cache on change and reuse world transform
                    if (!this._graph.globalMatrix) {
                        this._graph.globalMatrix = this.transformMatrix(transform);
                    }
                    childTransform = this._graph.globalMatrix;
                }
                else {
                    childTransform = this.transformMatrix(transform);
                }

                for (var i=0, n=this._childNodes.length; i<n; i++) {
                    if ( (cnode = this._childNodes[i]) ) {
                        cnode.collectDrawableObjects(childTransform, drawableCollection, singlePath, invalidateCache, planeMask);
                    }
                }
            }
        }
    )
);

// ### Switch ###
x3dom.registerNodeType(
    "Switch",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DGroupingNode,
        function (ctx) {
            x3dom.nodeTypes.Switch.superClass.call(this, ctx);

            this.addField_SFInt32(ctx, 'whichChoice', -1);
        },
        {
            fieldChanged: function (fieldName) {
                if (fieldName == "whichChoice") {
                    this.invalidateVolume();
                    this.invalidateCache();
                }
            },

            getVolume: function()
            {
                var vol = this._graph.volume;

                if (!this.volumeValid() && this._vf.render)
                {
                    if (this._vf.whichChoice >= 0 &&
                        this._vf.whichChoice < this._childNodes.length)
                    {
                        var child = this._childNodes[this._vf.whichChoice];

                        var childVol = (child && child._vf.render === true) ? child.getVolume() : null;

                        if (childVol && childVol.isValid())
                            vol.extendBounds(childVol.min, childVol.max);
                    }
                }

                return vol;
            },

            collectDrawableObjects: function (transform, drawableCollection, singlePath, invalidateCache, planeMask)
            {
                if (singlePath && (this._parentNodes.length > 1))
                    singlePath = false;

                if (singlePath && (invalidateCache = invalidateCache || this.cacheInvalid()))
                    this.invalidateCache();

                if (this._vf.whichChoice < 0 || this._vf.whichChoice >= this._childNodes.length ||
                    (planeMask = drawableCollection.cull(transform, this.graphState(), singlePath, planeMask)) <= 0) {
                    return;
                }

                var cnode, childTransform;

                if (singlePath) {
                    if (!this._graph.globalMatrix) {
                        this._graph.globalMatrix = this.transformMatrix(transform);
                    }
                    childTransform = this._graph.globalMatrix;
                }
                else {
                    childTransform = this.transformMatrix(transform);
                }

                if ( (cnode = this._childNodes[this._vf.whichChoice]) ) {
                    cnode.collectDrawableObjects(childTransform, drawableCollection, singlePath, invalidateCache, planeMask);
                }
            },

            doIntersect: function(line)
            {
                if (this._vf.whichChoice < 0 ||
                    this._vf.whichChoice >= this._childNodes.length) {
                    return false;
                }

                var child = this._childNodes[this._vf.whichChoice];
                if (child) {
                    return child.doIntersect(line);
                }

                return false;
            }
        }
    )
);

// ### X3DTransformNode ###
x3dom.registerNodeType(
    "X3DTransformNode",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DGroupingNode,
        function (ctx) {
            x3dom.nodeTypes.X3DTransformNode.superClass.call(this, ctx);

            if (ctx)
                ctx.doc._nodeBag.trans.push(this);
            else
                x3dom.debug.logWarning("X3DTransformNode: No runtime context found!");

            // holds the current matrix (local space transform)
            this._trafo = null;

            // workaround, only check on init if getStyle is necessary, since expensive
            this._needCssStyleUpdates = true;
        },
        {
            tick: function(t)
            {
              if (this._xmlNode && (
                  this._xmlNode['ontransform'] ||
                  this._xmlNode.hasAttribute('ontransform') ||
                  this._listeners['transform']) )
              {
                var transMatrix = this.getCurrentTransform();
                
                var event = {
                  target: this._xmlNode,
                  type: 'transform',
                  worldX: transMatrix._03,
                  worldY: transMatrix._13,
                  worldZ: transMatrix._23,
                  cancelBubble: false,
                  stopPropagation: function() { this.cancelBubble = true; }
                };
                
                this.callEvtHandler("ontransform", event);
              }
              
              // temporary per frame update method for CSS-Transform
              if (this._needCssStyleUpdates)
              {
                  var trans = x3dom.getStyle(this._xmlNode, "-webkit-transform") ||
                              x3dom.getStyle(this._xmlNode, "-moz-transform");
                  //x3dom.debug.logInfo('set css-trans: ' + this._DEF + ' to ' + trans);

                  if (trans && (trans != 'none')) {
                      this._trafo.setValueByStr(trans);
                      //x3dom.debug.logInfo(' valid set:' + this._trafo);

                      this.invalidateVolume();
                      this.invalidateCache();

                      return true;
                  }
                  this._needCssStyleUpdates = false;    // no special CSS set
              }
              
              return false;
            },

            transformMatrix: function(transform) {
                return transform.mult(this._trafo);
            },

            getVolume: function()
            {
                var vol = this._graph.volume;

                if (!this.volumeValid() && this._vf.render)
                {
                    this._graph.localMatrix = this._trafo;

                    for (var i=0, n=this._childNodes.length; i<n; i++)
                    {
                        var child = this._childNodes[i];
                        if (!child || child._vf.render !== true)
                            continue;

                        var childVol = child.getVolume();

                        if (childVol && childVol.isValid())
                            vol.extendBounds(childVol.min, childVol.max);
                    }

                    if (vol.isValid())
                        vol.transform(this._trafo);
                }

                return vol;
            },

            doIntersect: function(line)
            {
                var isect = false;
                var mat = this._trafo.inverse();

                var tmpPos = new x3dom.fields.SFVec3f(line.pos.x, line.pos.y, line.pos.z);
                var tmpDir = new x3dom.fields.SFVec3f(line.dir.x, line.dir.y, line.dir.z);

                line.pos = mat.multMatrixPnt(line.pos);
                line.dir = mat.multMatrixVec(line.dir);

                if (line.hitObject) {
                    line.dist *= line.dir.length();
                }

                // check for _nearest_ hit object and don't stop on first!
                for (var i=0; i<this._childNodes.length; i++)
                {
                    if (this._childNodes[i]) {
                        isect = this._childNodes[i].doIntersect(line) || isect;
                    }
                }

                line.pos.setValues(tmpPos);
                line.dir.setValues(tmpDir);

                if (isect) {
                    line.hitPoint = this._trafo.multMatrixPnt(line.hitPoint);
                    line.dist *= line.dir.length();
                }

                return isect;
            },

            parentRemoved: function(parent)
            {
                var i, n;
                
                if (this._parentNodes.length === 0) {
                    var doc = this.findX3DDoc();

                    for (i=0, n=doc._nodeBag.trans.length; i<n; i++) {
                        if (doc._nodeBag.trans[i] === this) {
                            doc._nodeBag.trans.splice(i, 1);
                        }
                    }
                }

                for (i=0, n=this._childNodes.length; i<n; i++) {
                    if (this._childNodes[i]) {
                        this._childNodes[i].parentRemoved(this);
                    }
                }
            }
        }
    )
);

// ### Transform ###
x3dom.registerNodeType(
    "Transform",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DTransformNode,
        function (ctx) {
            x3dom.nodeTypes.Transform.superClass.call(this, ctx);

            this.addField_SFVec3f(ctx, 'center', 0, 0, 0);
            this.addField_SFVec3f(ctx, 'translation', 0, 0, 0);
            this.addField_SFRotation(ctx, 'rotation', 0, 0, 1, 0);
            this.addField_SFVec3f(ctx, 'scale', 1, 1, 1);
            this.addField_SFRotation(ctx, 'scaleOrientation', 0, 0, 1, 0);

            // P' = T * C * R * SR * S * -SR * -C * P
            this._trafo = x3dom.fields.SFMatrix4f.translation(
                    this._vf.translation.add(this._vf.center)).
                mult(this._vf.rotation.toMatrix()).
                mult(this._vf.scaleOrientation.toMatrix()).
                mult(x3dom.fields.SFMatrix4f.scale(this._vf.scale)).
                mult(this._vf.scaleOrientation.toMatrix().inverse()).
                mult(x3dom.fields.SFMatrix4f.translation(this._vf.center.negate()));
        },
        {
            fieldChanged: function (fieldName)
            {
                if (fieldName == "center" || fieldName == "translation" ||
                    fieldName == "rotation" || fieldName == "scale" ||
                    fieldName == "scaleOrientation")
                {
                    // P' = T * C * R * SR * S * -SR * -C * P
                    this._trafo = x3dom.fields.SFMatrix4f.translation(
                                 this._vf.translation.add(this._vf.center)).
                            mult(this._vf.rotation.toMatrix()).
                            mult(this._vf.scaleOrientation.toMatrix()).
                            mult(x3dom.fields.SFMatrix4f.scale(this._vf.scale)).
                            mult(this._vf.scaleOrientation.toMatrix().inverse()).
                            mult(x3dom.fields.SFMatrix4f.translation(this._vf.center.negate()));

                    this.invalidateVolume();
                    this.invalidateCache();
                }
                else if (fieldName == "render") {
                    this.invalidateVolume();
                    this.invalidateCache();
                }
            }
        }
    )
);

// ### MatrixTransform ###
x3dom.registerNodeType(
    "MatrixTransform",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DTransformNode,
        function (ctx) {
            x3dom.nodeTypes.MatrixTransform.superClass.call(this, ctx);

            this.addField_SFMatrix4f(ctx, 'matrix', 1, 0, 0, 0,
                                                    0, 1, 0, 0,
                                                    0, 0, 1, 0,
                                                    0, 0, 0, 1);
            this._trafo = this._vf.matrix.transpose();
        },
        {
            fieldChanged: function (fieldName) {
                if (fieldName == "matrix") {
                    this._trafo = this._vf.matrix.transpose();

                    this.invalidateVolume();
                    this.invalidateCache();
                }
                else if (fieldName == "render") {
                    this.invalidateVolume();
                    this.invalidateCache();
                }
            }
        }
    )
);

// ### Group ###
x3dom.registerNodeType(
    "Group",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DGroupingNode,
        function (ctx) {
            x3dom.nodeTypes.Group.superClass.call(this, ctx);
        }
    )
);

// ### Block ###
x3dom.registerNodeType(
    "Block",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DGroupingNode,
        function (ctx) {
            x3dom.nodeTypes.Block.superClass.call(this, ctx);

            this.addField_MFString(ctx, 'nameSpaceName', []);
        }
    )
);

// ### StaticGroup ###
x3dom.registerNodeType(
    "StaticGroup",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DGroupingNode,
        function (ctx) {
            x3dom.nodeTypes.StaticGroup.superClass.call(this, ctx);

            // FIXME; implement optimizations; no need to maintain the children's
            // X3D representations, as they cannot be accessed after creation time
            x3dom.debug.logWarning("StaticGroup NYI");

            this.drawableCollection = null;
            this.needBvhRebuild = true;
            this.bvh = null;
        },
        {
            collectDrawableObjects: function (transform, drawableCollection, singlePath, invalidateCache, planeMask)
            {
                // check if multi parent sub-graph, don't cache in that case
                if (singlePath && (this._parentNodes.length > 1))
                    singlePath = false;

                // an invalid world matrix or volume needs to be invalidated down the hierarchy
                if (singlePath && (invalidateCache = invalidateCache || this.cacheInvalid()))
                    this.invalidateCache();

                // check if sub-graph can be culled away or render flag was set to false
                planeMask = drawableCollection.cull(transform, this.graphState(), singlePath, planeMask);
                if (planeMask <= 0) {
                    return;
                }

                var cnode, childTransform;

                if (singlePath) {
                    // rebuild cache on change and reuse world transform
                    if (!this._graph.globalMatrix) {
                        this._graph.globalMatrix = this.transformMatrix(transform);
                    }
                    childTransform = this._graph.globalMatrix;
                }
                else {
                    childTransform = this.transformMatrix(transform);
                }

                x3dom.Utils.startMeasure('bvhTraverse');

                if (this.needBvhRebuild)
                {
                    var drawableCollectionConfig = {
                        viewArea: drawableCollection.viewarea,
                        sortTrans: drawableCollection.sortTrans,
                        viewMatrix: drawableCollection.viewMatrix,
                        projMatrix: drawableCollection.projMatrix,
                        sceneMatrix: drawableCollection.sceneMatrix,
                        frustumCulling: false,
                        smallFeatureThreshold: 0,//1,    // THINKABOUTME
                        context: drawableCollection.context,
                        gl: drawableCollection.gl
                    };

                    this.drawableCollection = new x3dom.DrawableCollection(drawableCollectionConfig);

                    var i, n = this._childNodes.length;
                    for (i=0; i<n; i++) {
                        if ( (cnode = this._childNodes[i]) ) {
                            //this is only used to collect all drawables once
                            cnode.collectDrawableObjects(childTransform, this.drawableCollection, singlePath, invalidateCache, planeMask);
                        }
                    }
                    this.drawableCollection.concat();

                    this.bvh = this._nameSpace.doc._scene._vf.useCrossCompiled ?  new x3dom.bvh.EmscriptenBvH() : new x3dom.bvh.BIH();
                    //Add debugging decorator
                    this.bvh = this._nameSpace.doc._scene._vf.bvhDebug ? new x3dom.bvh.DebugDecorator(this.bvh,this._nameSpace.doc._scene) : this.bvh;

                    n = this.drawableCollection.length;
                    for (i = 0; i < n; i++) {
                        this.bvh.addDrawable(this.drawableCollection.get(i))
                    }
                    this.bvh.build();
                    this.needBvhRebuild = false;    // TODO: re-evaluate if Inline node is child node

                }

                this.bvh.collectDrawables(drawableCollection);


                var dt = x3dom.Utils.stopMeasure('bvhTraverse');
                this._nameSpace.doc.ctx.x3dElem.runtime.addMeasurement('BVH', dt);
            }
        }
    )
);

// ### RemoteSelectionGroup ###
x3dom.registerNodeType(
    "RemoteSelectionGroup",
    "Grouping",
    defineClass(x3dom.nodeTypes.X3DGroupingNode,
        function (ctx) {
            x3dom.nodeTypes.RemoteSelectionGroup.superClass.call(this, ctx);

            this.addField_MFString(ctx, 'url', ["ws://localhost:35668/cstreams/0"]);  // address for WebSocket connection
            this.addField_MFString(ctx, 'label', []);           // list for subsequent id/object pairs
            this.addField_SFInt32(ctx, 'maxRenderedIds', -1);   // max number of items to be rendered
            this.addField_SFBool(ctx, 'reconnect', true);       // if true, the node tries to reconnect
            this.addField_SFFloat(ctx, 'scaleRenderedIdsOnMove', 1.0);  // scaling factor to reduce render calls during navigation (between 0 and 1)
            this.addField_SFBool(ctx, 'enableCulling', true);   // if false, RSG works like normal group
            this.addField_MFString(ctx, 'invisibleNodes', []);  // allows disabling nodes with given label name (incl. prefix*)

            this._idList = [];          // to be updated by socket connection
            this._websocket = null;     // pointer to socket

            this._nameObjMap = {};
            this._createTime = [];
            this._visibleList = [];

            if (ctx)
                this.initializeSocket();    // init socket connection
            else
                x3dom.debug.logWarning("RemoteSelectionGroup: No runtime context found!");
        },
        {
            initializeSocket: function() 
            {
                var that = this;
                
                if ("WebSocket" in window)
                {
                    var wsUrl = "ws://localhost:35668/cstreams/0";
                    
                    if (this._vf.url.length && this._vf.url[0].length)
                        wsUrl = this._vf.url[0];

                    this._websocket = new WebSocket(wsUrl);

                    this._websocket._lastMsg = null;
                    this._websocket._lastData = "";

                    this._websocket.onopen = function(evt)
                    {
                        x3dom.debug.logInfo("WS Connected");
                        
                        var view = that._nameSpace.doc._viewarea.getViewMatrix();
                        this._lastMsg = view.toGL().toString();

                        view = that._nameSpace.doc._viewarea.getProjectionMatrix();
                        this._lastMsg += ("," + view.toGL().toString());

                        this.send(this._lastMsg);
                        x3dom.debug.logInfo("WS Sent: " + this._lastMsg);
                        
                        this._lastMsg = "";     // triggers first update
                        this._lastData = "";
                    };

                    this._websocket.onclose = function(evt) 
                    {
                        x3dom.debug.logInfo("WS Disconnected");

                        if (that._vf.reconnect)
                        {
                            window.setTimeout(function() { 
        						that.initializeSocket();
        					}, 2000);
					    }
                    };

                    this._websocket.onmessage = function(evt) 
                    {
                        if (that._vf.maxRenderedIds < 0)
                        {
                            // render all sent items
                            that._idList = x3dom.fields.MFString.parse(evt.data);
                        }
                        else if (that._vf.maxRenderedIds > 0) 
                        {
                            // render #maxRenderedIds items
                            that._idList = [];
                            var arr = x3dom.fields.MFString.parse(evt.data);
                            var n = Math.min(arr.length, Math.abs(that._vf.maxRenderedIds));

                            for (var i=0; i<n; ++i) {
                                that._idList[i] = arr[i];
                            }
                        }
                        
                        if (that._vf.maxRenderedIds != 0 && this._lastData != evt.data)
                        {
                            this._lastData = evt.data;
                            that._nameSpace.doc.needRender = true;
                            //x3dom.debug.logInfo("WS Response: " + evt.data);

                            that.invalidateVolume();
                            that.invalidateCache();
                        }
                    };

                    this._websocket.onerror = function(evt) 
                    {
                        x3dom.debug.logError(evt.data);
                    };

                    this._websocket.updateCamera = function()
                    {
                        // send again
                        var view = that._nameSpace.doc._viewarea.getViewMatrix();
                        var message = view.toGL().toString();

                        view = that._nameSpace.doc._viewarea.getProjectionMatrix();
                        message += ("," + view.toGL().toString());

                        if (this._lastMsg != null && this._lastMsg != message)
                        {
                            this._lastMsg = message;
                            this.send(message);
                            //x3dom.debug.logInfo("WS Sent: " + message);
                        }
                    };

                    // if there were a d'tor this would belong there
                    // this._websocket.close();
                }
                else
                {
                    x3dom.debug.logError("Browser has no WebSocket support!");
                }
            },

            nodeChanged: function ()
            {
                var n = this._vf.label.length;

                this._nameObjMap = {};
                this._createTime = new Array(n);
                this._visibleList = new Array(n);

                for (var i=0; i<n; ++i)
                {
                    var shape = this._childNodes[i];

                    if (shape && x3dom.isa(shape, x3dom.nodeTypes.X3DShapeNode))
                    {
                        this._nameObjMap[this._vf.label[i]] = { shape: shape, pos: i };
                        this._visibleList[i] = true;
                    }
					else {
						this._visibleList[i] = false;
						x3dom.debug.logError("Invalid children: " + this._vf.label[i]);
					}

					// init list that holds creation time of gl object
					this._createTime[i] = 0;
                }

                this.invalidateVolume();
                this.invalidateCache();

                x3dom.debug.logInfo("RemoteSelectionGroup has " + n + " entries.");
            },

            fieldChanged: function(fieldName)
            {
                if (fieldName == "url")
                {
                    if (this._websocket) {
                        this._websocket.close();
                        this._websocket = null;
                    }
                    this.initializeSocket();
                }
                else if (fieldName == "invisibleNodes")
                {
                    for (var i=0, n=this._vf.label.length; i<n; ++i)
                    {
                        var shape = this._childNodes[i];
                        
                        if (shape && x3dom.isa(shape, x3dom.nodeTypes.X3DShapeNode)) 
                        {
                            this._visibleList[i] = true;
                            
                            for (var j=0, numInvis=this._vf.invisibleNodes.length; j<numInvis; ++j)
                            {
                                var nodeName = this._vf.invisibleNodes[j];
                                var starInd = nodeName.lastIndexOf('*');
                                var matchNameBegin = false;
                                
                                if (starInd > 0) {
                                    nodeName = nodeName.substring(0, starInd);
                                    matchNameBegin = true;
                                }
                                if (nodeName.length <= 1)
                                    continue;
                                
                                if ((matchNameBegin && this._vf.label[i].indexOf(nodeName) == 0) ||
                                    this._vf.label[i] == nodeName) {
                                    this._visibleList[i] = false;
                                    break;
                                }
                            }
                        }
                        else {
                            this._visibleList[i] = false;
                        }
                    }

                    this.invalidateVolume();
                    this.invalidateCache();
                }
                else if (fieldName == "render") {
                    this.invalidateVolume();
                    this.invalidateCache();
                }
            },
            
            getNumRenderedObjects: function(len, isMoving)
            {
                var n = len;
				
                if (this._vf.maxRenderedIds > 0)
                {
                    var num = Math.max(this._vf.maxRenderedIds, 16);  // set lower bound
                    
                    var scale = 1;  // scale down on move
                    if (isMoving)
                        scale = Math.min(this._vf.scaleRenderedIdsOnMove, 1);
                    
                    num = Math.max(Math.round(scale * num), 0);
                    n = Math.min(n, num);
                }
                
                return n;
            },

            collectDrawableObjects: function (transform, drawableCollection, singlePath, invalidateCache, planeMask)
            {
                if (singlePath && (this._parentNodes.length > 1))
                    singlePath = false;

                if (singlePath && (invalidateCache = invalidateCache || this.cacheInvalid()))
                    this.invalidateCache();

                planeMask = drawableCollection.cull(transform, this.graphState(), singlePath, planeMask);
                if (planeMask <= 0) {
                    return;
                }

                var viewarea = this._nameSpace.doc._viewarea;
                var isMoving = viewarea.isMoving();
                
                var ts = new Date().getTime();
                var maxLiveTime = 10000;
                var i, n, numChild = this._childNodes.length;
                
                if (!this._vf.enableCulling)
                {
                    n = this.getNumRenderedObjects(numChild, isMoving);

                    var cnt = 0;
                    for (i=0; i<numChild; i++)
                    {
                        var shape = this._childNodes[i];
                        
                        if (shape)
                        {
                            var needCleanup = true;
                            
                            if (this._visibleList[i] && cnt < n &&
                                shape.collectDrawableObjects(transform, drawableCollection, singlePath, invalidateCache, planeMask))
                            {
                                this._createTime[i] = ts;
                                cnt++;
                                needCleanup = false;
                            }
                            
                            if (needCleanup && !isMoving && this._createTime[i] > 0 && 
                                ts - this._createTime[i] > maxLiveTime && shape._cleanupGLObjects)
                            {
                                shape._cleanupGLObjects(true);
                                this._createTime[i] = 0;
                            }
                        }
                    }
                    
                    return;
                }

                if (this._websocket)
                    this._websocket.updateCamera();

                if (this._vf.label.length)
                {
                    n = this.getNumRenderedObjects(this._idList.length, isMoving);
                    
                    for (i=0; i<n; i++)
                    {
                        var obj = this._nameObjMap[this._idList[i]];
                        if (obj && obj.shape) {
                            obj.shape.collectDrawableObjects(transform, drawableCollection, singlePath, invalidateCache, planeMask);
                            this._createTime[obj.pos] = ts;
                        }
						else
							x3dom.debug.logError("Invalid label: " + this._idList[i]);
                    }
                    
                    for (i=0; i<this._childNodes.length; i++)
                    {
                        if (this._childNodes[i] && !isMoving && this._createTime[i] > 0 && 
                            ts - this._createTime[i] > maxLiveTime && this._childNodes[i]._cleanupGLObjects)
                        {
                            this._childNodes[i]._cleanupGLObjects(true);
                            this._createTime[i] = 0;
                        }
                    }
                }
            }
        }
    )
);

// Not a real X3D node type
// ### Scene ###
x3dom.registerNodeType(
    "Scene",
    "Core",
    defineClass(x3dom.nodeTypes.X3DGroupingNode,
        function (ctx) {
            x3dom.nodeTypes.Scene.superClass.call(this, ctx);

            // define the experimental picking mode: box, idBuf, idBuf24, idBufId, color, texCoord
            this.addField_SFString(ctx, 'pickMode', "idBuf");
            // experimental field to switch off picking
            this.addField_SFBool(ctx, 'doPickPass', true);

            //VERY VERY experimental field, don't use unles you know exactly what's happening :)
            this.addField_SFBool(ctx, 'useCrossCompiled', false);
            //visualizes bvh box volumes with a line renderer
            this.addField_SFBool(ctx, 'bvhDebug', false);

            // yet another exp. field for shadow dom remapping
            this.addField_SFString(ctx, 'shadowObjectIdMapping', "");
            
            // If TRUE, transparent objects are sorted from back to front
            this.addField_SFBool(ctx, 'sortTrans', true);

            // If TRUE, objects outside the viewing frustum are ignored
            this.addField_SFBool(ctx, 'frustumCulling', true);

            // If TRUE, objects smaller than the threshold below are ignored (experimental)
            this.addField_SFBool(ctx, 'smallFeatureCulling', false);

            // (max) threshold for small feature culling
            this.addField_SFFloat(ctx, 'smallFeatureThreshold', 10);

            // very experimental field to further reduce rendered objects based on screen size during move
            this.addField_SFFloat(ctx, 'scaleRenderedIdsOnMove', 1.0);

            // experimental If true ARC adjusts rendering parameters
            this.addField_SFBool(ctx, 'enableARC', false);

            // define frame-rate range for quality-speed trade-off (experimental)
            this.addField_SFFloat(ctx, 'minFrameRate',  1.0);
            this.addField_SFFloat(ctx, 'maxFrameRate', 62.5);

            // 4 exp. factors for controlling speed-performance trade-off
            // factors could be in [0, 1] (and not evaluated if -1)
            this.addField_SFFloat(ctx, 'userDataFactor', -1);
            this.addField_SFFloat(ctx, 'screenSpaceFactor', -1);
            this.addField_SFFloat(ctx, 'drawCountFactor', -1);
            this.addField_SFFloat(ctx, 'tesselationErrorFactor', -1);
            
            this._lastMin = null;
            this._lastMax = null;
            
            this._shadowIdMap = null;
            //this.drawableObjects = null;    // webgl helper object
            this.drawableCollection = null;

            this.arc = null;
        },
        {
            /* Bindable getter (e.g. getViewpoint) are added automatically */
            
            nodeChanged: function()
            {
                this.loadMapping();

                this.invalidateVolume();
                this.invalidateCache();
            },
            
            fieldChanged: function(fieldName)
            {
                if (fieldName == "shadowObjectIdMapping")
                    this.loadMapping();
            },
            
            updateVolume: function()
            {
                var vol = this.getVolume();

                if (vol.isValid())
                {
                    // TODO: could directly use _lastMin/Max, but then take care of initial null check
                    var min = x3dom.fields.SFVec3f.MAX();
                    var max = x3dom.fields.SFVec3f.MIN();
                    vol.getBounds(min, max);

                    this._lastMin = min;
                    this._lastMax = max;
                }
            },
            
            loadMapping: function()
            {
                this._shadowIdMap = null;
                
                if (this._vf.shadowObjectIdMapping.length == 0) {
                    return;
                }
                
                var that = this;
                var xhr = new XMLHttpRequest();
                
                xhr.open("GET", encodeURI(this._nameSpace.getURL(this._vf.shadowObjectIdMapping)), true);
                xhr.send();
                
                xhr.onload = function()
                {
                    that._shadowIdMap = eval("(" + xhr.response + ")");
                };
            }
        }
    )
);
