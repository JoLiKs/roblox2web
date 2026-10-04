local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local Config = require(ReplicatedStorage.ObbyConfig)

local StageEvent = Instance.new("RemoteEvent")
StageEvent.Name = "StageEvent"
StageEvent.Parent = ReplicatedStorage

local world = Instance.new("Folder")
world.Name = "ObbyWorld"
world.Parent = workspace

local function part(name, size, pos, color, parent)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Position = pos
	p.Anchored = true
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.Parent = parent or world
	return p
end

local spawn = Instance.new("SpawnLocation")
spawn.Name = "Spawn"
spawn.Size = Vector3.new(14, 1, 14)
spawn.Position = Vector3.new(0, 1, 0)
spawn.Anchored = true
spawn.Neutral = true
spawn.Parent = world

local checkpoints: { [number]: BasePart } = {}
checkpoints[0] = spawn
local reached: { [Player]: number } = {}

local function setStage(player: Player, n: number)
	reached[player] = n
	local ls = player:FindFirstChild("leaderstats")
	if ls and ls:FindFirstChild("Stage") then
		ls.Stage.Value = n
	end
	StageEvent:FireClient(player, "stage", n, Config.StageCount)
end

local function buildStage(i: number)
	local z = -i * Config.StageGap
	local color = Config.Colors[(i - 1) % #Config.Colors + 1]
	local kind = i % 4
	if kind == 1 then
		-- stepping stones
		for k = 1, 4 do
			part("Stone", Vector3.new(5, 1, 5), Vector3.new((k % 2 == 0) and 4 or -4, 1, z + 20 - k * 4.5), color)
		end
	elseif kind == 2 then
		-- moving platform
		local mp = part("Mover", Vector3.new(8, 1, 6), Vector3.new(-10, 1, z + 10), color)
		local tween = TweenService:Create(mp, TweenInfo.new(2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), { Position = Vector3.new(10, 1, z + 10) })
		tween:Play()
		part("Ledge", Vector3.new(6, 1, 6), Vector3.new(-14, 1, z + 16), color)
	elseif kind == 3 then
		-- lava floor with narrow beam
		local lava = part("Lava", Vector3.new(16, 1, 20), Vector3.new(0, 0.2, z + 10), Color3.fromRGB(255, 70, 0))
		lava.Material = Enum.Material.Neon
		CollectionService:AddTag(lava, "Kill")
		part("Beam", Vector3.new(2, 1, 20), Vector3.new(0, 1, z + 10), color)
	else
		-- spinning kill bar over a platform
		part("Island", Vector3.new(14, 1, 14), Vector3.new(0, 1, z + 10), color)
		local bar = part("Spinner", Vector3.new(14, 1.2, 1.2), Vector3.new(0, 2.5, z + 10), Color3.fromRGB(40, 40, 40))
		CollectionService:AddTag(bar, "Kill")
		local ang = 0
		RunService.Heartbeat:Connect(function(dt)
			ang += dt * 2
			bar.CFrame = CFrame.new(0, 2.5, z + 10) * CFrame.Angles(0, ang, 0)
		end)
	end
	local cp = part("Checkpoint" .. i, Vector3.new(10, 1, 6), Vector3.new(0, 1, z), color)
	cp.Material = Enum.Material.Neon
	cp.Transparency = 0.2
	checkpoints[i] = cp
	cp.Touched:Connect(function(hit)
		local char = hit.Parent
		local pl = char and Players:GetPlayerFromCharacter(char)
		if pl and (reached[pl] or 0) < i then
			setStage(pl, i)
			if i == Config.StageCount then
				StageEvent:FireAllClients("win", pl.Name)
			end
		end
	end)
end

for i = 1, Config.StageCount do
	buildStage(i)
end

-- kill bricks
local function hookKill(inst: Instance)
	if inst:IsA("BasePart") then
		inst.Touched:Connect(function(hit)
			local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
			if hum and hum.Health > 0 then
				hum.Health = 0
			end
		end)
	end
end
for _, p in CollectionService:GetTagged("Kill") do
	hookKill(p)
end
CollectionService:GetInstanceAddedSignal("Kill"):Connect(hookKill)

Players.PlayerAdded:Connect(function(player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	ls.Parent = player
	local stage = Instance.new("IntValue")
	stage.Name = "Stage"
	stage.Parent = ls
	local deaths = Instance.new("IntValue")
	deaths.Name = "Deaths"
	deaths.Parent = ls
	reached[player] = 0
	player.RespawnLocation = nil
	player.CharacterAdded:Connect(function(char)
		local hum = char:WaitForChild("Humanoid") :: Humanoid
		local root = char:WaitForChild("HumanoidRootPart") :: BasePart
		local cp = checkpoints[reached[player] or 0]
		if cp then
			task.wait()
			char:PivotTo(cp.CFrame + Vector3.new(0, 4, 0))
		end
		hum.Died:Connect(function()
			deaths.Value += 1
			task.delay(1.2, function()
				if player.Parent then
					player:LoadCharacter()
				end
			end)
		end)
	end)
	task.defer(function()
		StageEvent:FireClient(player, "stage", 0, Config.StageCount)
	end)
end)

-- fallen players die
RunService.Heartbeat:Connect(function()
	for _, pl in Players:GetPlayers() do
		local c = pl.Character
		local r = c and c:FindFirstChild("HumanoidRootPart")
		if r and r.Position.Y < Config.RespawnHeight then
			local h = c:FindFirstChildOfClass("Humanoid")
			if h and h.Health > 0 then
				h.Health = 0
			end
		end
	end
end)
