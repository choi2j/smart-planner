import { useState } from "react";

interface Plan {
	title: string | "미정";
	description: string | "미정";
	due_date: string | "미정";
	due_time: string | "미정";
	location: string | "미정";
	priority: string | "미정";
	status: boolean;
}

interface ApiResponse {
	original_message: string;
	todo_count: number;
	todos: Plan[];
}

function App() {
	const [inputValue, setInputValue] = useState("");
	const [plans, setPlans] = useState<Plan[]>([
		{
			title: "",
			description: "",
			due_date: "",
			due_time: "",
			location: "",
			priority: "",
			status: false,
		},
	]);
	const [save, setSave] = useState<Plan[]>([]);
	const [sortOrder, setSortOrder] = useState<"date-asc" | "date-desc" | "priority" | "none">("none");
	const [calendarSortOrder, setCalendarSortOrder] = useState<"priority" | "time" | "none">("none");
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [editValues, setEditValues] = useState<Plan | null>(null);
	const [selectedDate, setSelectedDate] = useState<string | null>(null);

	const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(event.target.value);
	};

	const handleSubmit = async () => {
		if (!inputValue) {
			console.error("전송할 값이 필요합니다.");
			return;
		}
		console.log(inputValue);

		try {
			const response = await fetch("http://127.0.0.1:8000/todo-request", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: String(inputValue),
				}),
			});

			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

			const data: ApiResponse = await response.json();
			console.log(data);
			alert("데이터 전송 성공!");

			// Fill empty fields with "미정"
			const processedTodos = data.todos.map(todo => ({
				title: todo.title || "미정",
				description: todo.description || "미정",
				due_date: todo.due_date || "미정",
				due_time: todo.due_time || "미정",
				location: todo.location || "미정",
				priority: todo.priority || "미정",
				status: todo.status || false,
			}));

			setSave(prevSave => [...prevSave, ...processedTodos]);
			setInputValue("");
		} catch (error) {
			console.error(error);
			alert("데이터 전송 실패!");
		}
	};

	const handleToggleStatus = (index: number) => {
		const sortedList = getSortedPlans();
		const originalIndex = save.findIndex(item => item === sortedList[index]);
		const updatedSave = [...save];
		updatedSave[originalIndex].status = !updatedSave[originalIndex].status;
		setSave(updatedSave);
	};

	const handleRemove = (index: number) => {
		const sortedList = getSortedPlans();
		const originalIndex = save.findIndex(item => item === sortedList[index]);
		const updatedSave = save.filter((_, i) => i !== originalIndex);
		setSave(updatedSave);
	};

	const handleStartEdit = (index: number) => {
		setEditingIndex(index);
		setEditValues({ ...getSortedPlans()[index] });
	};

	const handleCancelEdit = () => {
		setEditingIndex(null);
		setEditValues(null);
	};

	const handleSaveEdit = (index: number) => {
		if (editValues) {
			const sortedList = getSortedPlans();
			const originalIndex = save.findIndex(item => item === sortedList[index]);
			const updatedSave = [...save];
			updatedSave[originalIndex] = editValues;
			setSave(updatedSave);
		}
		setEditingIndex(null);
		setEditValues(null);
	};

	const handleEditChange = (field: keyof Plan, value: string) => {
		if (editValues) {
			setEditValues({ ...editValues, [field]: value });
		}
	};

	const getPriorityValue = (priority: string) => {
		switch (priority.toLowerCase()) {
			case "높음":
			case "high":
				return 3;
			case "중간":
			case "medium":
				return 2;
			case "낮음":
			case "low":
				return 1;
			default:
				return 0;
		}
	};

	const getSortedPlans = () => {
		if (sortOrder === "none") return save;

		const sorted = [...save].sort((a, b) => {
			if (sortOrder === "priority") {
				const priorityA = getPriorityValue(a.priority);
				const priorityB = getPriorityValue(b.priority);
				return priorityB - priorityA; // Higher priority first
			}

			// Items without dates go to the end
			if (!a.due_date && !b.due_date) return 0;
			if (!a.due_date) return 1;
			if (!b.due_date) return -1;

			// Parse dates for comparison
			const dateA = new Date(a.due_date + (a.due_time ? ` ${a.due_time}` : ""));
			const dateB = new Date(b.due_date + (b.due_time ? ` ${b.due_time}` : ""));

			if (sortOrder === "date-asc") {
				return dateA.getTime() - dateB.getTime();
			} else {
				return dateB.getTime() - dateA.getTime();
			}
		});

		return sorted;
	};

	const getSortedCalendarTodos = (todos: Plan[]) => {
		if (calendarSortOrder === "none") return todos;

		const sorted = [...todos].sort((a, b) => {
			if (calendarSortOrder === "priority") {
				const priorityA = getPriorityValue(a.priority);
				const priorityB = getPriorityValue(b.priority);
				return priorityB - priorityA; // Higher priority first
			}

			if (calendarSortOrder === "time") {
				// Items without time go to the end
				if (!a.due_time && !b.due_time) return 0;
				if (!a.due_time) return 1;
				if (!b.due_time) return -1;

				// Compare times
				return a.due_time.localeCompare(b.due_time);
			}

			return 0;
		});

		return sorted;
	};

	const formatDate = (dateString: string) => {
		if (!dateString) return "";
		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return dateString; // Return original if invalid

			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
			const weekday = weekdays[date.getDay()];

			return `${year}년 ${month}월 ${day}일 (${weekday})`;
		} catch {
			return dateString; // Return original if formatting fails
		}
	};

	const formatTime = (timeString: string) => {
		if (!timeString) return "";
		try {
			// Handle various time formats
			const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
			if (timeMatch) {
				const hours = parseInt(timeMatch[1]);
				const minutes = timeMatch[2];
				const period = hours >= 12 ? "오후" : "오전";
				const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
				return `${period} ${displayHours}:${minutes}`;
			}
			return timeString; // Return original if no match
		} catch {
			return timeString;
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority.toLowerCase()) {
			case "높음":
			case "high":
				return "bg-red-100 text-red-800 border-red-200";
			case "중간":
			case "medium":
				return "bg-yellow-100 text-yellow-800 border-yellow-200";
			case "낮음":
			case "low":
				return "bg-green-100 text-green-800 border-green-200";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200";
		}
	};

	// Get todos by date
	const getTodosByDate = (dateString: string) => {
		return save.filter(todo => todo.due_date === dateString);
	};

	// Get todo count for a specific date
	const getTodoCountForDate = (dateString: string) => {
		return getTodosByDate(dateString).length;
	};

	// Get intensity color based on todo count (like GitHub)
	const getDateIntensityColor = (count: number, isSelected: boolean = false) => {
		if (isSelected) {
			return "bg-gray-900 text-white";
		}
		if (count === 0) return "bg-gray-100 text-gray-900";
		if (count === 1) return "bg-green-200 text-gray-900";
		if (count === 2) return "bg-green-400 text-gray-900";
		if (count >= 3) return "bg-green-600 text-white";
		return "bg-green-800 text-white";
	};

	// Generate calendar days for current month
	const generateCalendarDays = () => {
		const today = new Date();
		const year = today.getFullYear();
		const month = today.getMonth();

		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const daysInMonth = lastDay.getDate();
		const startingDayOfWeek = firstDay.getDay();

		const days = [];

		// Add empty cells for days before month starts
		for (let i = 0; i < startingDayOfWeek; i++) {
			days.push(null);
		}

		// Add actual days
		for (let day = 1; day <= daysInMonth; day++) {
			// Use local date string instead of ISO to avoid timezone issues
			const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
			days.push({
				day,
				dateString,
				isToday: dateString === todayString,
			});
		}

		return days;
	};

	const getCurrentMonthYear = () => {
		const today = new Date();
		return `${today.getFullYear()}년 ${today.getMonth() + 1}월`;
	};

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="container mx-auto px-4 py-8 max-w-7xl">
				{/* Header */}
				<div className="mb-8">
					<div className="flex items-center justify-between mb-4">
						<h1 className="text-4xl font-bold text-gray-900">Smart Planner</h1>
						<p className="text-gray-600">AI가 당신의 일정을 스마트하게 관리합니다</p>
					</div>
				</div>

				{/* Two Column Layout */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Left Column - Input and AI Results */}
					<div className="lg:col-span-2 space-y-6">
						{/* Input Section */}
						<div className="bg-white border-2 border-gray-300 p-6">
							<div className="flex flex-col sm:flex-row gap-3">
								<input type="text" value={inputValue} onChange={handleInput} placeholder="할 일을 입력하세요... (예: 내일 오후 3시에 회의)" className="flex-1 px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors" onKeyDown={e => e.key === "Enter" && handleSubmit()} />
								<button onClick={handleSubmit} className="px-6 py-3 bg-gray-900 border-2 border-gray-900 text-white font-medium hover:bg-gray-800 transition-colors">
									전송
								</button>
							</div>
						</div>

						{/* AI Results Section */}
						<div className="bg-white border-2 border-gray-300 p-6">
							<div className="flex items-center justify-between mb-6 flex-wrap gap-3">
								<h3 className="text-2xl font-bold text-gray-800">AI가 분석한 할 일 목록</h3>
								<div className="flex items-center gap-3">
									{save.length > 0 && (
										<>
											<div className="flex items-center gap-2 bg-white px-3 py-1.5 border-2 border-gray-300">
												<label className="text-sm text-gray-600 font-medium">정렬:</label>
												<select value={sortOrder} onChange={e => setSortOrder(e.target.value as "date-asc" | "date-desc" | "priority" | "none")} className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none cursor-pointer">
													<option value="none">기본</option>
													<option value="date-asc">날짜 오름차순</option>
													<option value="date-desc">날짜 내림차순</option>
													<option value="priority">우선순위</option>
												</select>
											</div>
											<span className="px-3 py-1 border-2 border-indigo-700 text-indigo-700 text-sm font-medium">{save.length}개</span>
										</>
									)}
								</div>
							</div>

							{save.length === 0 ? (
								<div className="text-center py-12">
									<p className="text-gray-500 text-lg">아직 할 일이 없습니다. 위에 입력해보세요!</p>
								</div>
							) : (
								<div className="space-y-4">
									{getSortedPlans().map((plan, index) => (
										<div key={index} className={`border-2 border-gray-300 p-5 transition-all hover:border-indigo-500 bg-white ${plan.status ? "opacity-60" : ""}`}>
											{editingIndex === index ? (
												// Edit Mode
												<div className="space-y-4">
													<div className="space-y-3">
														<div>
															<label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
															<input type="text" value={editValues?.title || ""} onChange={e => handleEditChange("title", e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500" />
														</div>
														<div>
															<label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
															<textarea value={editValues?.description || ""} onChange={e => handleEditChange("description", e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500" rows={2} />
														</div>
														<div className="grid grid-cols-2 gap-3">
															<div>
																<label className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
																<input type="text" value={editValues?.due_date || ""} onChange={e => handleEditChange("due_date", e.target.value)} placeholder="YYYY-MM-DD" className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500" />
															</div>
															<div>
																<label className="block text-sm font-medium text-gray-700 mb-1">시간</label>
																<input type="text" value={editValues?.due_time || ""} onChange={e => handleEditChange("due_time", e.target.value)} placeholder="HH:MM" className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500" />
															</div>
														</div>
														<div className="grid grid-cols-2 gap-3">
															<div>
																<label className="block text-sm font-medium text-gray-700 mb-1">장소</label>
																<input type="text" value={editValues?.location || ""} onChange={e => handleEditChange("location", e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500" />
															</div>
															<div>
																<label className="block text-sm font-medium text-gray-700 mb-1">우선순위</label>
																<select value={editValues?.priority || ""} onChange={e => handleEditChange("priority", e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500">
																	<option value="">선택</option>
																	<option value="높음">높음</option>
																	<option value="중간">중간</option>
																	<option value="낮음">낮음</option>
																</select>
															</div>
														</div>
													</div>
													<div className="flex gap-2 justify-end">
														<button onClick={handleCancelEdit} className="px-4 py-2 bg-gray-200 border-2 border-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">
															취소
														</button>
														<button onClick={() => handleSaveEdit(index)} className="px-4 py-2 bg-indigo-500 border-2 border-indigo-500 text-white hover:bg-indigo-600 transition-colors">
															저장
														</button>
													</div>
												</div>
											) : (
												// View Mode
												<>
													<div className="flex items-start gap-3 mb-3">
														<input type="checkbox" checked={plan.status} onChange={() => handleToggleStatus(index)} className="mt-1 w-5 h-5 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2 cursor-pointer" />
														<div className="flex-1">
															<div className="flex items-start justify-between mb-2">
																<h4 className={`text-xl font-semibold text-gray-800 flex-1 ${plan.status ? "line-through" : ""}`}>{plan.title}</h4>
																<div className="flex items-center gap-2">
																	{plan.priority && <span className={`px-3 py-1 text-sm font-semibold border-2 ${getPriorityColor(plan.priority)}`}>{plan.priority}</span>}
																	<button onClick={() => handleStartEdit(index)} className="px-3 py-1 text-sm border-2 border-blue-700 text-blue-700 hover:bg-blue-50 transition-colors">
																		수정
																	</button>
																	<button onClick={() => handleRemove(index)} className="px-3 py-1 text-sm border-2 border-red-700 text-red-700 hover:bg-red-50 transition-colors">
																		삭제
																	</button>
																</div>
															</div>

															{plan.description && <p className={`text-gray-600 mb-3 leading-relaxed ${plan.status ? "line-through" : ""}`}>{plan.description}</p>}

															<div className="flex flex-wrap gap-4 text-sm">
																<div className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-blue-700">
																	<span className="font-medium text-blue-700">날짜: {plan.due_date ? formatDate(plan.due_date) : "미정"}</span>
																</div>
																<div className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-purple-700">
																	<span className="font-medium text-purple-700">시간: {plan.due_time ? formatTime(plan.due_time) : "미정"}</span>
																</div>
																<div className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-green-700">
																	<span className="font-medium text-green-700">장소: {plan.location || "미정"}</span>
																</div>
															</div>
														</div>
													</div>
												</>
											)}
										</div>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Right Column - Calendar and Selected Date Todos */}
					<div className="lg:col-span-1 space-y-6">
						{/* Calendar Section */}
						<div className="bg-white border-2 border-gray-300 p-6">
							<h3 className="text-xl font-bold text-gray-900 mb-4">{getCurrentMonthYear()}</h3>

							{/* Calendar Grid */}
							<div className="grid grid-cols-7 gap-1">
								{/* Day Headers */}
								{["일", "월", "화", "수", "목", "금", "토"].map(day => (
									<div key={day} className="text-center text-xs font-medium text-gray-600 py-2">
										{day}
									</div>
								))}

								{/* Calendar Days */}
								{generateCalendarDays().map((day, index) => {
									if (!day) {
										return <div key={`empty-${index}`} className="aspect-square" />;
									}

									const todoCount = getTodoCountForDate(day.dateString);
									const isSelected = selectedDate === day.dateString;

									return (
										<button key={day.dateString} onClick={() => setSelectedDate(day.dateString)} className={`aspect-square border-2 flex items-center justify-center text-sm font-medium transition-colors ${isSelected ? "border-gray-900" : day.isToday ? "border-gray-900" : "border-gray-300 hover:border-gray-900"} ${getDateIntensityColor(todoCount, isSelected)}`} title={`${day.day}일 - ${todoCount}개의 할 일`}>
											{day.day}
										</button>
									);
								})}
							</div>
						</div>

						{/* Selected Date Todos */}
						{selectedDate && (
							<div className="bg-white border-2 border-gray-300 p-6">
								<div className="flex items-center justify-between mb-4">
									<h3 className="text-xl font-bold text-gray-900">{formatDate(selectedDate)}</h3>
									{getTodosByDate(selectedDate).length > 0 && (
										<div className="flex items-center gap-2 bg-white px-2 py-1 border-2 border-gray-300">
											<label className="text-xs text-gray-700 font-medium">정렬:</label>
											<select value={calendarSortOrder} onChange={e => setCalendarSortOrder(e.target.value as "priority" | "time" | "none")} className="bg-transparent text-xs font-medium text-gray-900 focus:outline-none cursor-pointer">
												<option value="none">기본</option>
												<option value="time">시간순</option>
												<option value="priority">우선순위</option>
											</select>
										</div>
									)}
								</div>

								{getTodosByDate(selectedDate).length === 0 ? (
									<p className="text-gray-500 text-center py-8">이 날짜에 할 일이 없습니다.</p>
								) : (
									<div className="space-y-3 max-h-[400px] overflow-y-auto">
										{getSortedCalendarTodos(getTodosByDate(selectedDate)).map((todo, index) => (
											<div key={index} className={`border-2 border-gray-300 p-3 bg-white ${todo.status ? "opacity-50" : ""}`}>
												<div className="flex items-start gap-2">
													<input
														type="checkbox"
														checked={todo.status}
														onChange={() => {
															const globalIndex = save.findIndex(t => t === todo);
															handleToggleStatus(globalIndex);
														}}
														className="mt-1 w-4 h-4 border-2 border-gray-400 cursor-pointer"
													/>
													<div className="flex-1">
														<h4 className={`font-semibold text-gray-900 ${todo.status ? "line-through" : ""}`}>{todo.title}</h4>
														{todo.description && <p className={`text-sm text-gray-600 mt-1 ${todo.status ? "line-through" : ""}`}>{todo.description}</p>}
														<div className="flex items-center gap-2 mt-2 text-xs">
															{todo.due_time && <span className="px-2 py-1 border-2 border-gray-300 text-gray-900">{formatTime(todo.due_time)}</span>}
															{todo.location && <span className="px-2 py-1 border-2 border-gray-300 text-gray-900">{todo.location}</span>}
															{todo.priority && <span className={`px-2 py-1 border-2 text-xs font-medium ${getPriorityColor(todo.priority)}`}>{todo.priority}</span>}
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export default App;
