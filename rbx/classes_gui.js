'use strict';
// GUI class definitions (rendering is in gui.js)
const C = require('../lua2js/core');
const { LuaTable, rtError, E } = C;
const D = require('./datatypes');
const I = require('./instance');
const { ENV, defClass, defMethods, P } = I;
const { Vector2, Vector3, Color3, UDim, UDim2, CFrame } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);
const u2 = (a, b, c, d) => new UDim2(a, b, c, d);
const c3 = (r, g, b) => new Color3(r, g, b);
const ro = (f) => P(undefined, { get: f, ro: true });
const abs = (i) => i.abs || { x: 0, y: 0, w: 0, h: 0 };


defClass('GuiBase', 'Instance', { noCreate: true });
defClass('GuiBase2d', 'GuiBase', { noCreate: true, props: {
  AbsolutePosition: ro((i) => new Vector2(abs(i).x, abs(i).y)),
  AbsoluteSize: ro((i) => new Vector2(abs(i).w, abs(i).h)),
  AbsoluteRotation: ro((i) => i.props.Rotation || 0),
  AutoLocalize: true, Localize: true,
} });
defClass('LayerCollector', 'GuiBase2d', { noCreate: true, props: { Enabled: true, ResetOnSpawn: true, ZIndexBehavior: En('ZIndexBehavior', 'Sibling') } });
defClass('ScreenGui', 'LayerCollector', { props: { DisplayOrder: 0, IgnoreGuiInset: false, ScreenInsets: En('ScreenInsets', 'CoreUISafeInsets'), OnTopOfCoreBlur: false, SafeAreaCompatibility: En('SafeAreaCompatibility', 'FullscreenExtension'), ClipToDeviceSafeArea: true } });
defClass('SurfaceGui', 'LayerCollector', { props: { Adornee: undefined, Face: En('NormalId', 'Front'), CanvasSize: new Vector2(800, 600), PixelsPerStud: 50, AlwaysOnTop: false, LightInfluence: 1, SizingMode: En('SurfaceGuiSizingMode', 'PixelsPerStud'), ZOffset: 0, Brightness: 1 } });
defClass('BillboardGui', 'LayerCollector', { props: { Adornee: undefined, Size: u2(0, 100, 0, 100), StudsOffset: new Vector3(0, 0, 0), StudsOffsetWorldSpace: new Vector3(0, 0, 0), ExtentsOffset: new Vector3(0, 0, 0), SizeOffset: new Vector2(0, 0), AlwaysOnTop: false, MaxDistance: 3.4e38, LightInfluence: 1, Active: false, ClipsDescendants: false, PlayerToHideFrom: undefined, Brightness: 1 } });
defClass('GuiObject', 'GuiBase2d', { noCreate: true, props: {
  Position: u2(0, 0, 0, 0), Size: u2(0, 100, 0, 100), AnchorPoint: new Vector2(0, 0), Rotation: 0, Visible: true,
  BackgroundColor3: c3(0.639, 0.635, 0.647), BackgroundTransparency: 0, BorderSizePixel: 1, BorderColor3: c3(0.106, 0.165, 0.208), BorderMode: En('BorderMode', 'Outline'),
  ZIndex: 1, LayoutOrder: 0, ClipsDescendants: false, Active: false, Selectable: false, Interactable: true, SizeConstraint: En('SizeConstraint', 'RelativeXY'), AutomaticSize: En('AutomaticSize', 'None'),
  NextSelectionUp: undefined, NextSelectionDown: undefined, NextSelectionLeft: undefined, NextSelectionRight: undefined, SelectionOrder: 0, SelectionImageObject: undefined,
}, events: ['InputBegan', 'InputEnded', 'InputChanged', 'MouseEnter', 'MouseLeave', 'MouseMoved', 'MouseWheelForward', 'MouseWheelBackward', 'TouchTap', 'TouchLongPress', 'TouchPan', 'TouchPinch', 'TouchSwipe', 'SelectionGained', 'SelectionLost'],
methods: {
  TweenSize(self, size, dir, style, t, override, cb) { ENV.tweenProps(self, { Size: size }, t || 1, style, dir, cb); return true; },
  TweenPosition(self, pos, dir, style, t, override, cb) { ENV.tweenProps(self, { Position: pos }, t || 1, style, dir, cb); return true; },
  TweenSizeAndPosition(self, size, pos, dir, style, t, override, cb) { ENV.tweenProps(self, { Size: size, Position: pos }, t || 1, style, dir, cb); return true; },
} });
defClass('Frame', 'GuiObject', { props: { Style: En('FrameStyle', 'Custom') } });
defClass('CanvasGroup', 'Frame', { props: { GroupTransparency: 0, GroupColor3: c3(1, 1, 1) } });
const textProps = {
  Text: '', TextColor3: c3(0.106, 0.106, 0.106), TextSize: 14, Font: En('Font', 'SourceSans'), FontFace: undefined, TextXAlignment: En('TextXAlignment', 'Center'), TextYAlignment: En('TextYAlignment', 'Center'),
  TextWrapped: false, TextScaled: false, TextTransparency: 0, TextStrokeColor3: c3(0, 0, 0), TextStrokeTransparency: 1, RichText: false, LineHeight: 1, TextTruncate: En('TextTruncate', 'None'), MaxVisibleGraphemes: -1, TextDirection: En('TextDirection', 'Auto'),
  TextBounds: P(undefined, { get: (i) => { const a = i.abs; const m = ENV.layout.measure(i, a ? a.w : 0); return new Vector2(Math.ceil(m.w), Math.ceil(m.h)); }, ro: true }),
  TextFits: P(undefined, { get: () => true, ro: true }), ContentText: P(undefined, { get: (i) => i.props.Text, ro: true }),
};
defClass('TextLabel', 'GuiObject', { props: Object.assign({}, textProps, { Text: 'Label' }) });
defClass('GuiButton', 'GuiObject', { noCreate: true, props: { Active: true, AutoButtonColor: true, Modal: false, Style: En('ButtonStyle', 'Custom'), Selected: false }, events: ['Activated', 'MouseButton1Click', 'MouseButton1Down', 'MouseButton1Up', 'MouseButton2Click', 'MouseButton2Down', 'MouseButton2Up'] });
defClass('TextButton', 'GuiButton', { props: Object.assign({}, textProps, { Text: 'Button' }) });
defClass('TextBox', 'GuiObject', { props: Object.assign({}, textProps, { Text: '', PlaceholderText: '', PlaceholderColor3: c3(0.7, 0.7, 0.7), ClearTextOnFocus: true, MultiLine: false, TextEditable: true, ShowNativeInput: true, CursorPosition: 1, SelectionStart: -1 }),
  events: ['FocusLost', 'Focused', 'ReturnPressed'],
  methods: { CaptureFocus(self) { if (ENV.gui) ENV.gui.focus(self); return E; }, ReleaseFocus(self) { if (ENV.gui) ENV.gui.blur(self); return E; }, IsFocused(self) { return !!(ENV.gui && ENV.gui.focused === self); } } });
const imgProps = { Image: '', ImageColor3: c3(1, 1, 1), ImageTransparency: 0, ScaleType: En('ScaleType', 'Stretch'), SliceCenter: new D.Rect(0, 0, 0, 0), SliceScale: 1, ImageRectOffset: new Vector2(0, 0), ImageRectSize: new Vector2(0, 0), ResampleMode: En('ResamplerMode', 'Default'), TileSize: u2(1, 0, 1, 0), IsLoaded: P(undefined, { get: () => true, ro: true }) };
defClass('ImageLabel', 'GuiObject', { props: imgProps });
defClass('ImageButton', 'GuiButton', { props: Object.assign({}, imgProps, { HoverImage: '', PressedImage: '' }) });
defClass('ViewportFrame', 'GuiObject', { props: { CurrentCamera: undefined, Ambient: c3(0.8, 0.8, 0.8), LightColor: c3(1, 1, 1), LightDirection: new Vector3(-1, -1, -1), ImageColor3: c3(1, 1, 1), ImageTransparency: 0 } });
defClass('VideoFrame', 'GuiObject', { props: { Video: '', Playing: false, Looped: false, Volume: 1 } });
defClass('ScrollingFrame', 'GuiObject', { props: {
  CanvasSize: u2(0, 0, 2, 0), CanvasPosition: new Vector2(0, 0), ScrollBarThickness: 12, ScrollingEnabled: true, ScrollBarImageColor3: c3(0, 0, 0), ScrollBarImageTransparency: 0,
  AutomaticCanvasSize: En('AutomaticSize', 'None'), ScrollingDirection: En('ScrollingDirection', 'XY'), VerticalScrollBarInset: En('ScrollBarInset', 'None'), HorizontalScrollBarInset: En('ScrollBarInset', 'None'),
  VerticalScrollBarPosition: En('VerticalScrollBarPosition', 'Right'), ElasticBehavior: En('ElasticBehavior', 'WhenScrollable'), TopImage: '', MidImage: '', BottomImage: '', ScrollBarImageColor: undefined,
  AbsoluteCanvasSize: P(undefined, { get: (i) => new Vector2(i.canvasW || 0, i.canvasH || 0), ro: true }), AbsoluteWindowSize: P(undefined, { get: (i) => new Vector2(abs(i).w, abs(i).h), ro: true }),
}, methods: { ScrollToTop(self) { self.lset('CanvasPosition', new Vector2(self.props.CanvasPosition.x, 0)); return E; }, ScrollToBottom(self) { self.lset('CanvasPosition', new Vector2(self.props.CanvasPosition.x, 1e9)); return E; } } });
defClass('UIBase', 'Instance', { noCreate: true });
defClass('UIComponent', 'UIBase', { noCreate: true });
defClass('UILayout', 'UIComponent', { noCreate: true, props: { HorizontalAlignment: En('HorizontalAlignment', 'Left'), VerticalAlignment: En('VerticalAlignment', 'Top'), SortOrder: En('SortOrder', 'LayoutOrder'), FillDirection: En('FillDirection', 'Vertical'), AbsoluteContentSize: P(undefined, { get: (i) => new Vector2(i.contentW || 0, i.contentH || 0), ro: true }) } });
defClass('UIListLayout', 'UILayout', { props: { Padding: new UDim(0, 0), Wraps: false, ItemLineAlignment: En('ItemLineAlignment', 'Automatic') } });
defClass('UIGridStyleLayout', 'UILayout', { noCreate: true });
defClass('UIGridLayout', 'UIGridStyleLayout', { props: { FillDirection: En('FillDirection', 'Horizontal'), CellPadding: u2(0, 5, 0, 5), CellSize: u2(0, 100, 0, 100), FillDirectionMaxCells: 0, StartCorner: En('StartCorner', 'TopLeft'), AbsoluteCellCount: P(undefined, { get: (i) => new Vector2(i.cellsX || 0, i.cellsY || 0), ro: true }), AbsoluteCellSize: P(undefined, { get: (i) => new Vector2(i.cellW || 0, i.cellH || 0), ro: true }) } });
defClass('UIPadding', 'UIComponent', { props: { PaddingTop: new UDim(0, 0), PaddingBottom: new UDim(0, 0), PaddingLeft: new UDim(0, 0), PaddingRight: new UDim(0, 0) } });
defClass('UICorner', 'UIComponent', { props: { CornerRadius: new UDim(0, 8) } });
defClass('UIStroke', 'UIComponent', { props: { Color: c3(0, 0, 0), Thickness: 1, Transparency: 0, Enabled: true, ApplyStrokeMode: En('ApplyStrokeMode', 'Contextual'), LineJoinMode: En('LineJoinMode', 'Round') } });
defClass('UIGradient', 'UIComponent', { props: { Color: undefined, Transparency: undefined, Rotation: 0, Offset: new Vector2(0, 0), Enabled: true } });
defClass('UIScale', 'UIComponent', { props: { Scale: 1 } });
defClass('UIAspectRatioConstraint', 'UIComponent', { props: { AspectRatio: 1, AspectType: En('AspectType', 'FitWithinMaxSize'), DominantAxis: En('DominantAxis', 'Width') } });
defClass('UISizeConstraint', 'UIComponent', { props: { MinSize: new Vector2(0, 0), MaxSize: new Vector2(Infinity, Infinity) } });
defClass('UITextSizeConstraint', 'UIComponent', { props: { MinTextSize: 1, MaxTextSize: 100 } });
defClass('UIFlexItem', 'UIComponent', { props: { FlexMode: En('UIFlexMode', 'None') } });
defClass('UIPageLayout', 'UIGridStyleLayout', { props: { Animated: true, Circular: false, EasingDirection: En('EasingDirection', 'Out'), EasingStyle: En('EasingStyle', 'Quad'), GamepadInputEnabled: true, Padding: new UDim(0, 0), ScrollWheelInputEnabled: true, TouchInputEnabled: true, TweenTime: 1 } });
defClass('UITableLayout', 'UIGridStyleLayout', { props: { FillEmptySpaceColumns: false, FillEmptySpaceRows: false, Padding: u2(0, 0, 0, 0) } });
module.exports = {};
