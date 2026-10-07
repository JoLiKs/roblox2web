-- Model:PivotTo много тысяч раз подряд (враг идёт к цели каждый тик) не копит ошибку поворота:
-- как в Roblox, CFrame частей остаётся ортонормированным и конечным.
local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local m = Instance.new("Model")
local body = Instance.new("Part"); body.Name = "Body"; body.Anchored = true; body.CanCollide = false
body.Size = Vector3.new(3, 3, 3); body.Parent = m
local eye = Instance.new("Part"); eye.Name = "Eye"; eye.Anchored = true; eye.CanCollide = false
eye.Size = Vector3.new(0.5, 0.5, 0.5); eye.CFrame = CFrame.new(0.6, 0.5, -1.5); eye.Parent = m
m.PrimaryPart = body
m.Parent = workspace
local pos = Vector3.new(0, 1.5, 0)
local a = 0
for i = 1, 6000 do
	a += 0.37 + (i % 7) * 0.11
	local dir = Vector3.new(math.cos(a), 0, math.sin(a))
	pos += dir * 0.3
	m:PivotTo(CFrame.lookAt(pos, pos + dir))
end
local cf = body.CFrame
local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
check("pivot: right stays unit", math.abs(r.Magnitude - 1) < 1e-6, r.Magnitude)
check("pivot: up stays unit", math.abs(u.Magnitude - 1) < 1e-6, u.Magnitude)
check("pivot: axes stay orthogonal", math.abs(r:Dot(l)) < 1e-6 and math.abs(u:Dot(l)) < 1e-6, r:Dot(l))
check("pivot: position follows target", (cf.Position - pos).Magnitude < 1e-6, (cf.Position - pos).Magnitude)
check("pivot: child offset preserved", math.abs((eye.Position - body.Position).Magnitude - (Vector3.new(0.6, 0.5, -1.5)).Magnitude) < 1e-6, (eye.Position - body.Position).Magnitude)
print("DONE")
