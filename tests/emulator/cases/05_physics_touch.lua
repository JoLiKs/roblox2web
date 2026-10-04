-- simulate: 14
local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local floor = Instance.new("Part"); floor.Size = Vector3.new(100, 2, 100); floor.Position = Vector3.new(0, -1, 0); floor.Anchored = true; floor.Parent = workspace
local ball = Instance.new("Part"); ball.Shape = Enum.PartType.Ball; ball.Size = Vector3.new(2, 2, 2); ball.Position = Vector3.new(30, 20, 30); ball.Parent = workspace
local touched = 0
ball.Touched:Connect(function(o) if o == floor then touched += 1 end end)
task.wait(2)
check("gravity fall & rest", ball.Position.Y < 3 and ball.Position.Y > 0.5, ball.Position.Y)
check("touched fired", touched >= 1, touched)
local trig = Instance.new("Part"); trig.Size = Vector3.new(6, 6, 6); trig.Position = Vector3.new(0, 3, 0); trig.Anchored = true; trig.CanCollide = false; trig.Transparency = 0.5; trig.Parent = workspace
local who = {}
trig.Touched:Connect(function(o) local pl = game.Players:GetPlayerFromCharacter(o.Parent); if pl then who[pl.Name] = true end end)
local ended = 0; trig.TouchEnded:Connect(function() ended += 1 end)
local pl = game.Players:GetPlayers()[1]
task.wait(1)
local hrp = pl.Character.HumanoidRootPart
check("character on floor", hrp.Position.Y > 2.5 and hrp.Position.Y < 4, hrp.Position.Y)
hrp.CFrame = CFrame.new(0, 3, 0); task.wait(0.3)
check("player touched trigger", who.Player1 == true)
-- humanoid walk
local hum = pl.Character.Humanoid
hrp.CFrame = CFrame.new(20, 3, 20); task.wait(0.3)
local moved = false
hum.MoveToFinished:Connect(function(reached) moved = reached end)
hum:MoveTo(Vector3.new(20, 3, 30))
task.wait(2)
check("MoveTo", moved and math.abs(hrp.Position.Z - 30) < 2.5, hrp.Position.Z)
hum.Health = 0; task.wait(0.2)
check("died", hum.Health <= 0)
-- wall collision blocks
local wall = Instance.new("Part"); wall.Size = Vector3.new(20, 10, 2); wall.Position = Vector3.new(30, 5, 20); wall.Anchored = true; wall.Parent = workspace
pl:LoadCharacter(); task.wait(0.5)
local ch = pl.Character; ch:PivotTo(CFrame.new(30, 3, 12)); task.wait(0.3)
ch.Humanoid:MoveTo(Vector3.new(30, 3, 30)); task.wait(2.5)
check("wall blocks", ch.HumanoidRootPart.Position.Z < 19.5, ch.HumanoidRootPart.Position.Z)
-- conveyor
local belt = Instance.new("Part"); belt.Size = Vector3.new(6, 1, 40); belt.Position = Vector3.new(-50, 0.5, 0); belt.Anchored = true; belt.AssemblyLinearVelocity = Vector3.new(0, 0, 12); belt.Parent = workspace
local box = Instance.new("Part"); box.Size = Vector3.new(2,2,2); box.Position = Vector3.new(-50, 3, -10); box.Parent = workspace
task.wait(1.5)
check("conveyor moves part", box.Position.Z > -6, box.Position.Z)
-- GetPartBoundsInBox / region
check("overlap query", #workspace:GetPartBoundsInBox(CFrame.new(0, 3, 0), Vector3.new(4, 4, 4)) >= 1)
print("DONE")
