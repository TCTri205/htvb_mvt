// ===================================================================
// PATCH FOR: lanhdao-hosocongviec-detail.js
// LINES: ~1455-1570 (handleAddMember function + helper functions)
// 
// INSTRUCTIONS:
// 1. Open backend/static/js/lanhdao-hosocongviec-detail.js
// 2. Find line ~1455 starting with: async function handleAddMember()
// 3. DELETE from line 1455 to line ~1570 (until you see: function removePendingSpecialist)
// 4. COPY the entire code below and PASTE at that location
// 5. Save the file
// ===================================================================

  async function handleAddMember() {
    const modal = $("#modalAddMember");
    if (!modal) return;
    await populateMemberSelect();
    modal.showModal();
    const form = modal.querySelector('[data-form="add-member-simple"]');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const userId = formData.get("user_id");
      const roleOnCase = formData.get("role_on_case");
      
      console.log("[LD] handleAddMember submit:", { userId, roleOnCase });
      
      if (!userId || !roleOnCase) {
        showToast("Vui lòng chọn đầy đủ thông tin", "warning");
        return;
      }
      try {
        const existingParticipants = await api.request(
          `/api/v1/cases/${caseId}/participants/`
        );
        
        console.log("[LD] Existing participants:", existingParticipants);
        
        const normalized = (
          Array.isArray(existingParticipants)
            ? existingParticipants
            : existingParticipants?.participants || []
        )
          .map((item) => {
            const user = item.user;
            // ✅ Only accept UUID fields, NOT username
            const normalizedUserId = user?.user_id || user?.id || user?.pk;
            if (!normalizedUserId || !item.role_on_case) {
              console.warn("[LD] Skipping participant with invalid user_id:", item);
              return null;
            }
            return {
              user_id: String(normalizedUserId), // Ensure string format
              role_on_case: item.role_on_case,
            };
          })
          .filter(Boolean);
          
        console.log("[LD] Normalized existing participants:", normalized);
        
        // Filter out existing user (if re-adding with different role)
        const filtered = normalized.filter((item) => item.user_id !== userId);
        
        // Add new participant
        filtered.push({ 
          user_id: String(userId),
          role_on_case: roleOnCase 
        });
        
        console.log("[LD] Final participants payload:", { participants: filtered });
        
        await api.request(`/api/v1/cases/${caseId}/participants/`, {
          method: "PUT",
          body: JSON.stringify({ participants: filtered }),
        });
        
        showToast("Đã thêm thành viên thành công");
        modal.close();
        form.reset();
        await loadParticipants();
      } catch (err) {
        console.error("[LD] handleAddMember error:", err);
        showToast(err.message || "Không thể thêm thành viên", "error");
      }
    };
  }

  // Show message in assign form
  function showAssignMessage(text, isError) {
    const assignMessage = $("#ld-assign-message");
    if (!assignMessage) return;
    assignMessage.textContent = text || "";
    assignMessage.classList.toggle("text-rose-500", Boolean(isError));
    assignMessage.classList.toggle(
      "text-emerald-600",
      Boolean(!isError && text)
    );
  }

  // === PENDING SPECIALISTS MANAGEMENT ===
  function addPendingSpecialist(specialist, taskData) {
    // specialist: { user_id, full_name, department_name }
    // taskData: { title, due_at }
    const userId = specialist.user_id || specialist.id;

    // Check if already added
    const existing = pendingSpecialists.find((s) => s.user_id === userId);
    if (existing) {
      showAssignMessage("Chuyên viên này đã được thêm vào danh sách.", true);
      return false;
    }

    pendingSpecialists.push({
      user_id: userId,
      full_name: specialist.full_name || specialist.username,
      department_name:
        specialist.department_name || specialist.department?.name || "",
      task: taskData || { title: "", due_at: "" },
    });

    renderPendingSpecialists();
    showAssignMessage(
      `Đã thêm ${specialist.full_name || specialist.username}`,
      false
    );
    return true;
  }

  // NOTE: Continue with function removePendingSpecialist() after this...
