import { useState, useEffect } from "react";

interface Plan {
	title: string | "미정";
	description: string | "미정";
	event_date: string | "미정";
	event_time: string | "미정";
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
	const [save, setSave] = useState<Plan[]>([]);
	const [sortOrder, setSortOrder] = useState<"date-asc" | "date-desc" | "priority" | "none">("none");
	const [calendarSortOrder, setCalendarSortOrder] = useState<"priority" | "time" | "none">("none");
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [editValues, setEditValues] = useState<Plan | null>(null);
	const [selectedDate, setSelectedDate] = useState<string | null>(null);

	// Auth modal state
	const [showAuthModal, setShowAuthModal] = useState(false);
	const [isSignupMode, setIsSignupMode] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	// User state
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [currentUser, setCurrentUser] = useState<{userId: string; email: string; accessToken: string} | null>(null);

	// Filter state
	const [hideCompleted, setHideCompleted] = useState(false);

	// Manual add modal state
	const [showManualAddModal, setShowManualAddModal] = useState(false);
	const [manualTodo, setManualTodo] = useState<Plan>({
		title: "",
		description: "",
		event_date: "",
		event_time: "",
		location: "",
		priority: "medium",
		status: false,
	});

	// Load todos from database
	const loadTodosFromDatabase = async (token: string) => {
		try {
			const response = await fetch("https://smart-planner-back.vercel.app/tasks/load", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				throw new Error("Failed to load todos from database");
			}

			const todos: Plan[] = await response.json();
			console.log("Loaded todos from database:", todos);

			// Fill empty fields with "미정"
			const processedTodos = todos.map(todo => ({
				title: todo.title || "미정",
				description: todo.description || "미정",
				event_date: todo.event_date || "미정",
				event_time: todo.event_time || "미정",
				location: todo.location || "미정",
				priority: todo.priority || "미정",
				status: todo.status || false,
			}));

			setSave(processedTodos);
			console.log("Todos loaded successfully from database");
		} catch (error) {
			console.error("Failed to load todos from database:", error);
		}
	};

	// Restore login state from localStorage on mount
	useEffect(() => {
		const loadAuthAndData = async () => {
			const accessToken = localStorage.getItem("accessToken");
			const userId = localStorage.getItem("userId");
			const userEmail = localStorage.getItem("userEmail");

			if (accessToken && userId && userEmail) {
				setIsLoggedIn(true);
				setCurrentUser({
					userId,
					email: userEmail,
					accessToken,
				});

				// Load todos from database after restoring login state
				await loadTodosFromDatabase(accessToken);
			}
		};

		loadAuthAndData();
	}, []);

	const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(event.target.value);
	};

	const handleSubmit = async () => {
		// Check if user is logged in
		if (!isLoggedIn) {
			alert("로그인이 필요합니다.");
			setShowAuthModal(true);
			return;
		}

		if (!inputValue) {
			console.error("전송할 값이 필요합니다.");
			return;
		}
		console.log(inputValue);

		try {
			const response = await fetch("https://smart-planner-back.vercel.app/todo-request", {
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
				event_date: todo.event_date || "미정",
				event_time: todo.event_time || "미정",
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

	const getFilteredPlans = () => {
		if (hideCompleted) {
			return save.filter(plan => !plan.status);
		}
		return save;
	};

	const getSortedPlans = () => {
		const filteredPlans = getFilteredPlans();
		if (sortOrder === "none") return filteredPlans;

		const sorted = [...filteredPlans].sort((a, b) => {
			if (sortOrder === "priority") {
				const priorityA = getPriorityValue(a.priority);
				const priorityB = getPriorityValue(b.priority);
				return priorityB - priorityA; // Higher priority first
			}

			// Items without dates go to the end
			if (!a.event_date && !b.event_date) return 0;
			if (!a.event_date) return 1;
			if (!b.event_date) return -1;

			// Parse dates for comparison
			const dateA = new Date(a.event_date + (a.event_time ? ` ${a.event_time}` : ""));
			const dateB = new Date(b.event_date + (b.event_time ? ` ${b.event_time}` : ""));

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
				if (!a.event_time && !b.event_time) return 0;
				if (!a.event_time) return 1;
				if (!b.event_time) return -1;

				// Compare times
				return a.event_time.localeCompare(b.event_time);
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
		const todosForDate = save.filter(todo => todo.event_date === dateString);
		// Apply hideCompleted filter
		if (hideCompleted) {
			return todosForDate.filter(todo => !todo.status);
		}
		return todosForDate;
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

	const handleSignin = async () => {
		if (!email || !password) {
			alert("이메일과 비밀번호를 입력해주세요.");
			return;
		}

		try {
			const response = await fetch("https://smart-planner-back.vercel.app/signin", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: email,
					password: password,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`로그인 실패: ${errorText}`);
			}

			const data = await response.json();
			console.log("로그인 성공:", data);

			// Set user state
			setIsLoggedIn(true);
			setCurrentUser({
				userId: data.user_id,
				email: data.email,
				accessToken: data.access_token
			});

			// Store in localStorage
			localStorage.setItem("accessToken", data.access_token);
			localStorage.setItem("userId", data.user_id);
			localStorage.setItem("userEmail", data.email);

			// Load todos from database after login
			await loadTodosFromDatabase(data.access_token);

			alert("로그인 성공!");
			setShowAuthModal(false);
			setEmail("");
			setPassword("");
		} catch (error) {
			console.error("로그인 오류:", error);
			alert(error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다.");
		}
	};

	const handleLogout = () => {
		// Clear authentication state
		setIsLoggedIn(false);
		setCurrentUser(null);
		localStorage.removeItem("accessToken");
		localStorage.removeItem("userId");
		localStorage.removeItem("userEmail");

		// Reset all page data
		setSave([]);
		setInputValue("");
		setSortOrder("none");
		setCalendarSortOrder("none");
		setEditingIndex(null);
		setEditValues(null);
		setSelectedDate(null);
		setHideCompleted(false);

		alert("로그아웃 되었습니다.");
	};

	const handleSaveTodos = async () => {
		if (!isLoggedIn || !currentUser) {
			alert("로그인이 필요합니다.");
			return;
		}

		if (save.length === 0) {
			alert("저장할 할 일이 없습니다.");
			return;
		}

		try {
			const response = await fetch("https://smart-planner-back.vercel.app/tasks/save", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${currentUser.accessToken}`,
				},
				body: JSON.stringify({
					todos: save.map(todo => ({
						title: todo.title,
						description: todo.description,
						event_date: todo.event_date === "미정" ? null : todo.event_date,
						event_time: todo.event_time === "미정" ? null : todo.event_time,
						location: todo.location === "미정" ? null : todo.location,
						priority: todo.priority === "미정" ? "medium" : todo.priority,
						status: todo.status,
					})),
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`저장 실패: ${errorText}`);
			}

			const data = await response.json();
			console.log("저장 성공:", data);
			alert(`${data.count}개의 할 일이 저장되었습니다!`);
		} catch (error) {
			console.error("저장 오류:", error);
			alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
		}
	};

	const handleManualAdd = () => {
		if (!manualTodo.title.trim()) {
			alert("제목을 입력해주세요.");
			return;
		}

		const newTodo: Plan = {
			title: manualTodo.title || "미정",
			description: manualTodo.description || "미정",
			event_date: manualTodo.event_date || "미정",
			event_time: manualTodo.event_time || "미정",
			location: manualTodo.location || "미정",
			priority: manualTodo.priority || "medium",
			status: false,
		};

		setSave(prevSave => [...prevSave, newTodo]);
		setShowManualAddModal(false);
		setManualTodo({
			title: "",
			description: "",
			event_date: "",
			event_time: "",
			location: "",
			priority: "medium",
			status: false,
		});
		alert("할 일이 추가되었습니다!");
	};

	const handleSignup = async () => {
		if (!email || !password) {
			alert("이메일과 비밀번호를 입력해주세요.");
			return;
		}

		if (password.length < 6) {
			alert("비밀번호는 최소 6자 이상이어야 합니다.");
			return;
		}

		try {
			const response = await fetch("https://smart-planner-back.vercel.app/signup", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: email,
					password: password,
					provider: 'google'
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`회원가입 실패: ${errorText}`);
			}

			const data = await response.json();
			console.log("회원가입 성공:", data);
			alert("회원가입 성공! 로그인해주세요.");
			setIsSignupMode(false);
			setPassword("");
		} catch (error) {
			console.error("회원가입 오류:", error);
			alert(error instanceof Error ? error.message : "회원가입 중 오류가 발생했습니다.");
		}
	};

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Manual Add Todo Modal */}
			{showManualAddModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white border-2 border-gray-300 p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
						<div className="text-center mb-6">
							<h2 className="text-3xl font-bold text-gray-800 mb-2">할 일 추가</h2>
							<p className="text-gray-600">수동으로 할 일을 추가합니다</p>
						</div>

						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">제목 *</label>
								<input
									type="text"
									value={manualTodo.title}
									onChange={(e) => setManualTodo({...manualTodo, title: e.target.value})}
									placeholder="할 일 제목"
									className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">설명</label>
								<textarea
									value={manualTodo.description}
									onChange={(e) => setManualTodo({...manualTodo, description: e.target.value})}
									placeholder="상세 설명"
									className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
									rows={3}
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
									<input
										type="date"
										value={manualTodo.event_date}
										onChange={(e) => setManualTodo({...manualTodo, event_date: e.target.value})}
										className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
									/>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">시간</label>
									<input
										type="time"
										value={manualTodo.event_time}
										onChange={(e) => setManualTodo({...manualTodo, event_time: e.target.value})}
										className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
									/>
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">장소</label>
								<input
									type="text"
									value={manualTodo.location}
									onChange={(e) => setManualTodo({...manualTodo, location: e.target.value})}
									placeholder="장소"
									className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">우선순위</label>
								<select
									value={manualTodo.priority}
									onChange={(e) => setManualTodo({...manualTodo, priority: e.target.value})}
									className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
								>
									<option value="low">낮음</option>
									<option value="medium">중간</option>
									<option value="high">높음</option>
								</select>
							</div>

							<button
								onClick={handleManualAdd}
								className="w-full px-6 py-3 bg-gray-900 border-2 border-gray-900 text-white font-semibold hover:bg-gray-800 transition-all"
							>
								추가하기
							</button>
						</div>

						<button
							onClick={() => {
								setShowManualAddModal(false);
								setManualTodo({
									title: "",
									description: "",
									event_date: "",
									event_time: "",
									location: "",
									priority: "medium",
									status: false,
								});
							}}
							className="mt-6 w-full px-6 py-3 bg-gray-200 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all"
						>
							취소
						</button>
					</div>
				</div>
			)}

			{/* Auth Modal */}
			{showAuthModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white border-2 border-gray-300 p-8 max-w-md w-full mx-4">
						<div className="text-center mb-6">
							<h2 className="text-3xl font-bold text-gray-800 mb-2">
								{isSignupMode ? "회원가입" : "로그인"}
							</h2>
							<p className="text-gray-600">
								{isSignupMode ? "계정을 생성하여 시작하세요" : "이메일과 비밀번호로 로그인하세요"}
							</p>
						</div>

						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">이메일</label>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="example@email.com"
									className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
									onKeyDown={(e) => e.key === "Enter" && (isSignupMode ? handleSignup() : handleSignin())}
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									className="w-full px-4 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
									onKeyDown={(e) => e.key === "Enter" && (isSignupMode ? handleSignup() : handleSignin())}
								/>
								{isSignupMode && (
									<p className="text-xs text-gray-500 mt-1">최소 6자 이상</p>
								)}
							</div>

							<button
								onClick={isSignupMode ? handleSignup : handleSignin}
								className="w-full px-6 py-3 bg-gray-900 border-2 border-gray-900 text-white font-semibold hover:bg-gray-800 transition-all"
							>
								{isSignupMode ? "회원가입" : "로그인"}
							</button>

							<div className="text-center">
								<button
									onClick={() => {
										setIsSignupMode(!isSignupMode);
										setPassword("");
									}}
									className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
								>
									{isSignupMode ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
								</button>
							</div>
						</div>

						<button
							onClick={() => {
								setShowAuthModal(false);
								setEmail("");
								setPassword("");
								setIsSignupMode(false);
							}}
							className="mt-6 w-full px-6 py-3 bg-gray-200 border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-all"
						>
							취소
						</button>
					</div>
				</div>
			)}

			<div className="container mx-auto px-4 py-8 max-w-7xl">
				{/* Header */}
				<div className="mb-8">
					<div className="flex items-center justify-between mb-4">
						<h1 className="text-4xl font-bold text-gray-900">Smart Planner</h1>
						<div className="flex items-center gap-4">
							<p className="text-gray-600">AI가 당신의 일정을 스마트하게 관리합니다</p>
							{isLoggedIn && currentUser ? (
								<div className="flex items-center gap-3">
									<span className="text-sm text-gray-700">{currentUser.email}</span>
									<button
										onClick={handleLogout}
										className="px-4 py-2 bg-red-500 border-2 border-red-500 text-white font-semibold hover:bg-red-600 transition-all"
									>
										로그아웃
									</button>
								</div>
							) : (
								<button
									onClick={() => setShowAuthModal(true)}
									className="px-4 py-2 bg-indigo-500 border-2 border-indigo-500 text-white font-semibold hover:bg-indigo-600 transition-all"
								>
									로그인
								</button>
							)}
						</div>
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
								<div className="flex items-center gap-3 flex-wrap">
									{/* Manual Add Button */}
									<button
										onClick={() => setShowManualAddModal(true)}
										className="px-4 py-2 bg-green-500 border-2 border-green-500 text-white font-semibold hover:bg-green-600 transition-all text-sm"
									>
										+ 수동 추가
									</button>

									{/* Save Button - only show when logged in */}
									{isLoggedIn && save.length > 0 && (
										<button
											onClick={handleSaveTodos}
											className="px-4 py-2 bg-blue-500 border-2 border-blue-500 text-white font-semibold hover:bg-blue-600 transition-all text-sm"
										>
											저장
										</button>
									)}

									{/* Hide Completed Button */}
									{save.length > 0 && (
										<button
											onClick={() => setHideCompleted(!hideCompleted)}
											className={`px-4 py-2 border-2 font-semibold transition-all text-sm ${
												hideCompleted
													? "bg-gray-700 border-gray-700 text-white hover:bg-gray-800"
													: "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
											}`}
										>
											{hideCompleted ? "모두 보기" : "완료 숨기기"}
										</button>
									)}

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
																<input type="text" value={editValues?.event_date || ""} onChange={e => handleEditChange("event_date", e.target.value)} placeholder="YYYY-MM-DD" className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500" />
															</div>
															<div>
																<label className="block text-sm font-medium text-gray-700 mb-1">시간</label>
																<input type="text" value={editValues?.event_time || ""} onChange={e => handleEditChange("event_time", e.target.value)} placeholder="HH:MM" className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-indigo-500" />
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
																	<span className="font-medium text-blue-700">날짜: {plan.event_date ? formatDate(plan.event_date) : "미정"}</span>
																</div>
																<div className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-purple-700">
																	<span className="font-medium text-purple-700">시간: {plan.event_time ? formatTime(plan.event_time) : "미정"}</span>
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
							<h3 className="text-2xl font-bold text-gray-900 mb-6">{getCurrentMonthYear()}</h3>

							{/* Calendar Grid */}
							<div className="grid grid-cols-7 gap-2">
								{/* Day Headers */}
								{["일", "월", "화", "수", "목", "금", "토"].map(day => (
									<div key={day} className="text-center text-sm font-semibold text-gray-700 py-3">
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
										<button
											key={day.dateString}
											onClick={() => setSelectedDate(day.dateString)}
											className={`aspect-square border-2 flex flex-col items-center justify-center text-base font-semibold transition-colors p-2 ${isSelected ? "border-gray-900" : day.isToday ? "border-gray-900" : "border-gray-300 hover:border-gray-900"} ${getDateIntensityColor(todoCount, isSelected)}`}
											title={`${day.day}일 - ${todoCount}개의 할 일`}
										>
											<span className="text-lg">{day.day}</span>
											{todoCount > 0 && (
												<span className="text-xs font-bold mt-1 opacity-80">
													{todoCount}개
												</span>
											)}
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
															{todo.event_time && <span className="px-2 py-1 border-2 border-gray-300 text-gray-900">{formatTime(todo.event_time)}</span>}
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
