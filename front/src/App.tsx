import { useState, useEffect } from "react";

interface User {
	id: string;
	email: string;
}

interface Plan {
	title: string | "";
	description: string | "";
	due_date: string | "";
	due_time: string | "";
	location: string | "";
	priority: string | "";
	status: boolean;
}

interface Save extends Plan {
	user_id: string;
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
	const [sortOrder, setSortOrder] = useState<"date-asc" | "date-desc" | "none">("none");
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [editValues, setEditValues] = useState<Plan | null>(null);

	// Authentication state
	const [user, setUser] = useState<User | null>(null);
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [showLoginModal, setShowLoginModal] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Load token and user from localStorage on mount
	useEffect(() => {
		const loadAuthFromStorage = async () => {
			// Check if we're coming back from OAuth callback
			const urlParams = new URLSearchParams(window.location.search);
			const code = urlParams.get("code");

			if (code) {
				// Exchange code for session
				try {
					const response = await fetch(`http://127.0.0.1:8000/auth/callback?code=${code}`, {
						method: "POST",
					});

					if (response.ok) {
						const data = await response.json();
						const { access_token, user: userData } = data;

						// Store in localStorage
						localStorage.setItem("access_token", access_token);
						localStorage.setItem("user", JSON.stringify({ id: userData.id, email: userData.email }));

						// Set state
						setAccessToken(access_token);
						setUser({ id: userData.id, email: userData.email });

						// Load todos
						await loadTodos(access_token);

						// Clean up URL
						window.history.replaceState({}, document.title, window.location.pathname);
					}
				} catch (error) {
					console.error("Failed to process OAuth callback:", error);
					alert("로그인 처리 중 오류가 발생했습니다.");
				}
			} else {
				// Load from localStorage
				const storedToken = localStorage.getItem("access_token");
				const storedUser = localStorage.getItem("user");

				if (storedToken && storedUser) {
					setAccessToken(storedToken);
					setUser(JSON.parse(storedUser));
					await loadTodos(storedToken);
				}
			}

			setIsLoading(false);
		};

		loadAuthFromStorage();
	}, []);

	// Auto-save todos when save state changes (debounced)
	useEffect(() => {
		if (user && accessToken && save.length > 0) {
			const timer = setTimeout(() => {
				saveTodos();
			}, 2000); // Auto-save 2 seconds after changes

			return () => clearTimeout(timer);
		}
	}, [save, user, accessToken]);

	const handleLogin = async (provider: string) => {
		try {
			const response = await fetch("http://127.0.0.1:8000/auth/oauth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ provider }),
			});

			const data = await response.json();
			if (data.url) {
				window.location.href = data.url;
			}
		} catch (error) {
			console.error("Login failed:", error);
			alert("로그인 실패!");
		}
	};

	const handleLogout = () => {
		localStorage.removeItem("access_token");
		localStorage.removeItem("user");
		setAccessToken(null);
		setUser(null);
		setSave([]);
		alert("로그아웃되었습니다.");
	};

	const saveTodos = async () => {
		if (!accessToken || save.length === 0) return;

		try {
			const response = await fetch("http://127.0.0.1:8000/todos/save", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({ todos: save }),
			});

			if (!response.ok) throw new Error("Failed to save todos");
			console.log("Todos saved successfully");
		} catch (error) {
			console.error("Failed to save todos:", error);
		}
	};

	const loadTodos = async (token?: string) => {
		const authToken = token || accessToken;
		if (!authToken) return;

		try {
			const response = await fetch("http://127.0.0.1:8000/todos/load", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
			});

			if (!response.ok) throw new Error("Failed to load todos");

			const todos: Plan[] = await response.json();
			setSave(todos);
			console.log("Todos loaded successfully");
		} catch (error) {
			console.error("Failed to load todos:", error);
		}
	};

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

			// Store new todos in plans
			setPlans(data.todos);

			// Accumulate all todos in save (keep previous + add new)
			setSave((prevSave) => [...prevSave, ...data.todos]);

			setInputValue("");
		} catch (error) {
			console.error(error);
			alert("데이터 전송 실패!");
		}
	};

	const handleToggleStatus = (index: number) => {
		const sortedList = getSortedPlans();
		const originalIndex = save.findIndex((item) => item === sortedList[index]);
		const updatedSave = [...save];
		updatedSave[originalIndex].status = !updatedSave[originalIndex].status;
		setSave(updatedSave);
	};

	const handleRemove = (index: number) => {
		const sortedList = getSortedPlans();
		const originalIndex = save.findIndex((item) => item === sortedList[index]);
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
			const originalIndex = save.findIndex((item) => item === sortedList[index]);
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

	const getSortedPlans = () => {
		if (sortOrder === "none") return save;

		const sorted = [...save].sort((a, b) => {
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

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
				<div className="text-center">
					<div className="text-6xl mb-4">⏳</div>
					<p className="text-gray-600 text-lg">로딩 중...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
			{/* Login Modal */}
			{showLoginModal && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
					<div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
						<div className="text-center mb-6">
							<h2 className="text-3xl font-bold text-gray-800 mb-2">로그인</h2>
							<p className="text-gray-600">소셜 계정으로 간편하게 로그인하세요</p>
						</div>

						<div className="space-y-3">
							<button
								onClick={() => handleLogin("google")}
								className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all flex items-center justify-center gap-3"
							>
								<span className="text-2xl">🔍</span>
								Google로 로그인
							</button>

							<button
								onClick={() => handleLogin("github")}
								className="w-full px-6 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-600 transition-all flex items-center justify-center gap-3"
							>
								<span className="text-2xl">🐙</span>
								GitHub로 로그인
							</button>
						</div>

						<button
							onClick={() => setShowLoginModal(false)}
							className="mt-6 w-full px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-all"
						>
							취소
						</button>
					</div>
				</div>
			)}

			<div className="container mx-auto px-4 py-8 max-w-4xl">
				{/* Header */}
				<div className="text-center mb-8">
					<div className="flex items-center justify-between mb-4">
						<div className="flex-1"></div>
						<h1 className="text-4xl font-bold text-gray-800">Smart Planner</h1>
						<div className="flex-1 flex justify-end">
							{user ? (
								<div className="flex items-center gap-3">
									<div className="text-right">
										<p className="text-sm font-medium text-gray-700">{user.email}</p>
										<button
											onClick={handleLogout}
											className="text-xs text-red-600 hover:text-red-700 font-medium"
										>
											로그아웃
										</button>
									</div>
								</div>
							) : (
								<button
									onClick={() => setShowLoginModal(true)}
									className="px-4 py-2 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-600 transition-all"
								>
									로그인
								</button>
							)}
						</div>
					</div>
					<p className="text-gray-600">AI가 당신의 일정을 스마트하게 관리합니다</p>
					{user && (
						<p className="text-sm text-green-600 mt-2">✓ 자동 저장 활성화</p>
					)}
				</div>

				{/* Input Section */}
				<div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
					<div className="flex flex-col sm:flex-row gap-3">
						<input
							type="text"
							value={inputValue}
							onChange={handleInput}
							placeholder="할 일을 입력하세요... (예: 내일 오후 3시에 회의)"
							className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
							onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
						/>
						<button
							onClick={handleSubmit}
							className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transform hover:scale-105 transition-all shadow-md"
						>
							전송
						</button>
					</div>
				</div>

				{/* Plans Section */}
				<div className="bg-white rounded-2xl shadow-lg p-6">
					<div className="flex items-center justify-between mb-6 flex-wrap gap-3">
						<h3 className="text-2xl font-bold text-gray-800">
							AI가 분석한 할 일 목록
						</h3>
						<div className="flex items-center gap-3">
							{save.length > 0 && (
								<>
									<div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200">
										<label className="text-sm text-gray-600 font-medium">정렬:</label>
										<select
											value={sortOrder}
											onChange={(e) => setSortOrder(e.target.value as "date-asc" | "date-desc" | "none")}
											className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer"
										>
											<option value="none">기본</option>
											<option value="date-asc">날짜 오름차순 ⬆</option>
											<option value="date-desc">날짜 내림차순 ⬇</option>
										</select>
									</div>
									<span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
										{save.length}개
									</span>
								</>
							)}
						</div>
					</div>

					{save.length === 0 ? (
						<div className="text-center py-12">
							<div className="text-6xl mb-4">📝</div>
							<p className="text-gray-500 text-lg">
								아직 할 일이 없습니다. 위에 입력해보세요!
							</p>
						</div>
					) : (
						<div className="space-y-4">
							{getSortedPlans().map((plan, index) => (
								<div
									key={index}
									className={`border-2 border-gray-100 rounded-xl p-5 hover:shadow-md transition-all hover:border-indigo-200 bg-gradient-to-r from-white to-gray-50 ${
										plan.status ? "opacity-60" : ""
									}`}
								>
									{editingIndex === index ? (
										// Edit Mode
										<div className="space-y-4">
											<div className="space-y-3">
												<div>
													<label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
													<input
														type="text"
														value={editValues?.title || ""}
														onChange={(e) => handleEditChange("title", e.target.value)}
														className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
													/>
												</div>
												<div>
													<label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
													<textarea
														value={editValues?.description || ""}
														onChange={(e) => handleEditChange("description", e.target.value)}
														className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
														rows={2}
													/>
												</div>
												<div className="grid grid-cols-2 gap-3">
													<div>
														<label className="block text-sm font-medium text-gray-700 mb-1">날짜</label>
														<input
															type="text"
															value={editValues?.due_date || ""}
															onChange={(e) => handleEditChange("due_date", e.target.value)}
															placeholder="YYYY-MM-DD"
															className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
														/>
													</div>
													<div>
														<label className="block text-sm font-medium text-gray-700 mb-1">시간</label>
														<input
															type="text"
															value={editValues?.due_time || ""}
															onChange={(e) => handleEditChange("due_time", e.target.value)}
															placeholder="HH:MM"
															className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
														/>
													</div>
												</div>
												<div className="grid grid-cols-2 gap-3">
													<div>
														<label className="block text-sm font-medium text-gray-700 mb-1">장소</label>
														<input
															type="text"
															value={editValues?.location || ""}
															onChange={(e) => handleEditChange("location", e.target.value)}
															className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
														/>
													</div>
													<div>
														<label className="block text-sm font-medium text-gray-700 mb-1">우선순위</label>
														<select
															value={editValues?.priority || ""}
															onChange={(e) => handleEditChange("priority", e.target.value)}
															className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
														>
															<option value="">선택</option>
															<option value="높음">높음</option>
															<option value="중간">중간</option>
															<option value="낮음">낮음</option>
														</select>
													</div>
												</div>
											</div>
											<div className="flex gap-2 justify-end">
												<button
													onClick={handleCancelEdit}
													className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
												>
													취소
												</button>
												<button
													onClick={() => handleSaveEdit(index)}
													className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
												>
													저장
												</button>
											</div>
										</div>
									) : (
										// View Mode
										<>
											<div className="flex items-start gap-3 mb-3">
												<input
													type="checkbox"
													checked={plan.status}
													onChange={() => handleToggleStatus(index)}
													className="mt-1 w-5 h-5 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2 cursor-pointer"
												/>
												<div className="flex-1">
													<div className="flex items-start justify-between mb-2">
														<h4 className={`text-xl font-semibold text-gray-800 flex-1 ${plan.status ? "line-through" : ""}`}>
															{plan.title}
														</h4>
														<div className="flex items-center gap-2">
															{plan.priority && (
																<span
																	className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPriorityColor(
																		plan.priority
																	)}`}
																>
																	{plan.priority}
																</span>
															)}
															<button
																onClick={() => handleStartEdit(index)}
																className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
															>
																수정
															</button>
															<button
																onClick={() => handleRemove(index)}
																className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
															>
																삭제
															</button>
														</div>
													</div>

													{plan.description && (
														<p className={`text-gray-600 mb-3 leading-relaxed ${plan.status ? "line-through" : ""}`}>
															{plan.description}
														</p>
													)}

													<div className="flex flex-wrap gap-4 text-sm">
														<div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
															<span className="text-lg">📅</span>
															<span className="font-medium text-blue-700">
																{plan.due_date ? formatDate(plan.due_date) : "미정"}
															</span>
														</div>
														<div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100">
															<span className="text-lg">⏰</span>
															<span className="font-medium text-purple-700">
																{plan.due_time ? formatTime(plan.due_time) : "미정"}
															</span>
														</div>
														<div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
															<span className="text-lg">📍</span>
															<span className="font-medium text-green-700">{plan.location || "미정"}</span>
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
		</div>
	);
}

export default App;
