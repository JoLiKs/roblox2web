local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local sg = Instance.new("ScreenGui"); sg.Parent = game.Players.LocalPlayer.PlayerGui
local f = Instance.new("Frame"); f.Size = UDim2.new(0.5, 10, 0, 100); f.Position = UDim2.new(0, 20, 0, 30); f.Parent = sg
task.wait(0.1)
local vp = workspace.CurrentCamera.ViewportSize
check("viewport", vp.X > 0 and vp.Y > 0, vp)
check("abs size", math.abs(f.AbsoluteSize.X - (vp.X * 0.5 + 10)) < 1 and f.AbsoluteSize.Y == 100, f.AbsoluteSize)
local l = Instance.new("UIListLayout"); l.Padding = UDim.new(0, 5); l.Parent = f
for i = 1, 3 do local c = Instance.new("Frame"); c.Size = UDim2.new(1, 0, 0, 20); c.LayoutOrder = 4 - i; c.Name = "c" .. i; c.Parent = f end
task.wait(0.1)
local c1, c3 = f.c1, f.c3
check("list layout order", c3.AbsolutePosition.Y < c1.AbsolutePosition.Y, c3.AbsolutePosition.Y)
check("list layout padding", math.abs((f.c2.AbsolutePosition.Y - f.c3.AbsolutePosition.Y) - 25) < 0.5)
check("content size", math.abs(l.AbsoluteContentSize.Y - 70) < 0.5, l.AbsoluteContentSize)
local g = Instance.new("Frame"); g.Size = UDim2.fromOffset(100, 100); g.Parent = sg
local gl = Instance.new("UIGridLayout"); gl.CellSize = UDim2.fromOffset(30, 30); gl.CellPadding = UDim2.fromOffset(5, 5); gl.Parent = g
for i = 1, 4 do local c = Instance.new("Frame"); c.Name = "g" .. i; c.Parent = g end
task.wait(0.1)
check("grid layout", g.g4.AbsolutePosition.Y > g.g1.AbsolutePosition.Y and g.g2.AbsolutePosition.X == g.g1.AbsolutePosition.X + 35, g.g2.AbsolutePosition)
local lbl = Instance.new("TextLabel"); lbl.Text = "Hello"; lbl.AutomaticSize = Enum.AutomaticSize.XY; lbl.Parent = sg
task.wait(0.1)
check("automatic size", lbl.AbsoluteSize.X > 10 and lbl.AbsoluteSize.Y > 5, lbl.AbsoluteSize)
check("textbounds", lbl.TextBounds.X > 10, lbl.TextBounds)
local btn = Instance.new("TextButton"); btn.Parent = sg
local clicks = 0; btn.Activated:Connect(function() clicks += 1 end)
check("button props", btn.AutoButtonColor == true and btn.Active == true)
print("DONE")
