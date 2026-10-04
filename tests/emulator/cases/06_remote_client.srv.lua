local RS = game:GetService("ReplicatedStorage")
local ev = Instance.new("RemoteEvent"); ev.Name = "Ev"; ev.Parent = RS
local fn = Instance.new("RemoteFunction"); fn.Name = "Fn"; fn.Parent = RS
local ss = Instance.new("Folder"); ss.Name = "Secret"; ss.Parent = game:GetService("ServerStorage")
ev.OnServerEvent:Connect(function(plr, a, b, c)
	if a == "hello" then
		b.x += 1
		ev:FireClient(plr, "srv:" .. a, b, c * 2)
	elseif a == "tbl" then
		ev:FireClient(plr, b)
	end
end)
fn.OnServerInvoke = function(plr, n) return n * 2, "ok" end
