-- DescendantAdded / DescendantRemoving срабатывают для всех потомков вставляемого поддерева (как в Roblox):
-- клиентские «локализаторы» и подписчики видят TextLabel внутри BillboardGui, добавленного целиком.
local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local folder = Instance.new("Folder"); folder.Parent = workspace
local added, removed = {}, {}
workspace.DescendantAdded:Connect(function(d) added[d.Name] = (added[d.Name] or 0) + 1 end)
workspace.DescendantRemoving:Connect(function(d) removed[d.Name] = (removed[d.Name] or 0) + 1 end)
local g = Instance.new("BillboardGui"); g.Name = "Tag"
local l = Instance.new("TextLabel"); l.Name = "Label"; l.Parent = g
local inner = Instance.new("Frame"); inner.Name = "Inner"; inner.Parent = l
g.Parent = folder
task.wait()
check("DescendantAdded for root", added.Tag == 1, added.Tag)
check("DescendantAdded for child", added.Label == 1, added.Label)
check("DescendantAdded for grandchild", added.Inner == 1, added.Inner)
g.Parent = nil
task.wait()
check("DescendantRemoving for all", removed.Tag == 1 and removed.Label == 1 and removed.Inner == 1, tostring(removed.Label))
local p = Instance.new("Part"); p.Name = "Solo"; p.Parent = folder
task.wait()
check("leaf instance once", added.Solo == 1, added.Solo)
print("DONE")
